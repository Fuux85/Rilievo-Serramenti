const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // conserva file in memoria

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.raw({ type: 'application/octet-stream', limit: '50mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/invia', upload.array('foto[]'), (req, res) => {
    const data = req.body;
    const files = req.files || [];

    console.log('=== DATI RICEVUTI ===');
    console.log('Body:', JSON.stringify(data, null, 2));
    console.log('Files:', files.length);

    const doc = new PDFDocument({ bufferPages: true });
    const fileName = `rilievo_${data.cliente_nome}_${Date.now()}.pdf`;
    const filePath = __dirname + '/' + fileName;
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Titolo
    doc.fontSize(20).text('Rilievo Serramenti', { align: 'center' });
    doc.moveDown();

    // Info Cantiere
    doc.fontSize(14).font('Helvetica-Bold').text('Info Cantiere', { underline: true });
    doc.fontSize(12).font('Helvetica');
    doc.text(`Data Rilievo: ${data.data_rilievo || 'N/A'}`);
    doc.text(`Tecnico: ${data.tecnico_incaricato || 'N/A'}`);
    doc.text(`Cliente: ${data.cliente_nome || 'N/A'}`);
    doc.text(`Venditore: ${data.venditore || 'N/A'}`);
    doc.text(`Indirizzo: ${data.indirizzo_cliente || 'N/A'}`);
    doc.text(`Piano: ${data.piano || 'N/A'}`);
    doc.text(`Autoscala: ${data.autoscala || 'N/A'}`);
    doc.text(`Occupazione suolo pubblico: ${data.occupazione_suolo || 'N/A'}`);
    doc.text(`Ascensore: ${data.ascensore || 'N/A'}`);
    doc.text(`ZTL: ${data.ztl || 'N/A'}`);
    doc.moveDown();

    // Schemi di posa principali
    ['canvasA', 'canvasB', 'canvasC', 'canvasD'].forEach(canvasId => {
        if (data[canvasId]) {
            try {
                const base64Data = data[canvasId].replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                doc.addPage();
                doc.fontSize(14).font('Helvetica-Bold').text(`Schema Posa ${canvasId.toUpperCase()}`, { underline: true });
                doc.moveDown();
                doc.image(buffer, { width: 500 });
            } catch (e) {
                console.log(`Errore caricamento ${canvasId}:`, e.message);
            }
        }
    });

    // Serramenti - Gestione corretta degli array
    const tipi = Array.isArray(data['tipo_serramento']) ? data['tipo_serramento'] : (data['tipo_serramento'] ? [data['tipo_serramento']] : []);
    const nomi = Array.isArray(data['nome_serramento']) ? data['nome_serramento'] : (data['nome_serramento'] ? [data['nome_serramento']] : []);
    const larghezze = Array.isArray(data['larghezza']) ? data['larghezza'] : (data['larghezza'] ? [data['larghezza']] : []);
    const altezze = Array.isArray(data['altezza']) ? data['altezza'] : (data['altezza'] ? [data['altezza']] : []);
    const aperture = Array.isArray(data['apertura']) ? data['apertura'] : (data['apertura'] ? [data['apertura']] : []);
    const vetri = Array.isArray(data['vetro']) ? data['vetro'] : (data['vetro'] ? [data['vetro']] : []);
    const contatti = Array.isArray(data['contatti']) ? data['contatti'] : (data['contatti'] ? [data['contatti']] : []);
    const note = Array.isArray(data['note']) ? data['note'] : (data['note'] ? [data['note']] : []);

    if (tipi.length > 0) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Serramenti Rilevati', { underline: true });
        doc.moveDown();
        doc.fontSize(11).font('Helvetica');

        tipi.forEach((tipo, idx) => {
            // separatore semplice
            doc.moveDown();
            doc.fontSize(13).font('Helvetica-Bold').text(`SERRAMENTO ${idx + 1}`, { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(11).font('Helvetica');
            doc.text(`Tipologia: ${tipo || 'N/A'}`);
            doc.text(`Nome: ${nomi[idx] || 'N/A'}`);
            doc.text(`Larghezza: ${larghezze[idx] || 'N/A'} mm`);
            doc.text(`Altezza: ${altezze[idx] || 'N/A'} mm`);
            doc.text(`Senso apertura: ${aperture[idx] || 'N/A'}`);
            doc.text(`Tipologia vetro: ${vetri[idx] || 'N/A'}`);
            doc.text(`Contatti magnetici: ${contatti[idx] || 'N/A'}`);
            doc.text(`Note: ${note[idx] || 'Nessuna'}`);

            // Disegno del serramento
            const canvasKey = `canvasS${idx + 1}`;
            if (data[canvasKey]) {
                try {
                    const base64 = data[canvasKey].replace(/^data:image\/png;base64,/, '');
                    const buffer = Buffer.from(base64, 'base64');
                    doc.moveDown();
                    doc.fontSize(12).font('Helvetica-Bold').text('Schema:');
                    doc.moveDown(0.5);
                    doc.image(buffer, { width: 400 });
                } catch (e) {
                    console.log(`Errore caricamento ${canvasKey}:`, e.message);
                }
            }
        });
    }

    // Foto
    if (files.length > 0) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Foto Cantiere', { underline: true });
        doc.moveDown();

        files.forEach((file, idx) => {
            if (idx > 0) doc.addPage();
            try {
                doc.image(file.buffer, { fit: [500, 400], align: 'center' });
                doc.moveDown();
                doc.fontSize(10).text(`Foto ${idx + 1}`);
            } catch (e) {
                console.log(`Errore caricamento foto ${idx + 1}:`, e.message);
            }
        });
    }

    doc.end();

    writeStream.on('finish', () => {
        let transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'arredoinfissitorino@gmail.com', 
                pass: 'avfaqbpgjhkuezzr' 
            }
        });

        let mailOptions = {
            from: 'arredoinfissitorino@gmail.com',
            to: 'DESTINAZIONE@azienda.it',
            subject: `Rilievo Serramenti - ${data.cliente_nome}`,
            text: `Rilievo compilato il ${data.data_rilievo} da ${data.tecnico_incaricato}.\nIn allegato il documento completo.`,
            attachments: [{ path: filePath }]
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Errore invio:', error);
                res.send('Errore nell\'invio dell\'email');
            } else {
                console.log('Email inviata:', info.response);
                res.send('PDF generato e inviato correttamente!');
            }
        });
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server in ascolto su http://localhost:${PORT}`);
});
