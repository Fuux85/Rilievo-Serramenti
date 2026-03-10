const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() }); // Conserva file in memoria

// Configurazione limiti per gestire disegni e foto pesanti
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/invia', upload.array('foto[]'), (req, res) => {
    const data = req.body;
    const files = req.files || [];

    console.log('=== NUOVO RILIEVO RICEVUTO ===');
    console.log('Cliente:', data.cliente_nome);

    // 1. INIZIALIZZAZIONE PDF IN MEMORIA (MODIFICA PUNTO 2)
    const doc = new PDFDocument({ bufferPages: true, margin: 30 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // Gestione fine generazione PDF e invio Email
    doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);

        // CONFIGURAZIONE GMAIL (MODIFICA PUNTO 2)
        let transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true, 
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        let mailOptions = {
            from: process.env.GMAIL_USER,
            to: 'arredoinfissitorino@gmail.com', 
            subject: Rilievo Serramenti - ${data.cliente_nome},
            text: Rilievo compilato il ${data.data_rilievo} da ${data.tecnico_incaricato}.\nIn allegato il documento PDF.,
            attachments: [{
                filename: rilievo_${data.cliente_nome || 'documento'}.pdf,
                content: pdfData
            }]
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('ERRORE INVIO:', error);
                if (!res.headersSent) res.status(500).send("Errore nell'invio email.");
            } else {
                console.log('EMAIL INVIATA CON SUCCESSO:', info.response);
                if (!res.headersSent) res.send('PDF inviato correttamente!');
            }
        });
    });

    // --- COSTRUZIONE CONTENUTO PDF ---

    // Titolo e Info Cantiere
    doc.fontSize(20).text('Rilievo Serramenti', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold').text('Info Cantiere', { underline: true });
    doc.fontSize(12).font('Helvetica');
    doc.text(Data Rilievo: ${data.data_rilievo || 'N/A'});
    doc.text(Tecnico: ${data.tecnico_incaricato || 'N/A'});
    doc.text(Cliente: ${data.cliente_nome || 'N/A'});
    doc.text(Indirizzo: ${data.indirizzo_cliente || 'N/A'});
    doc.moveDown();

    // Schemi di posa (Canvas A, B, C, D)
    ['canvasA', 'canvasB', 'canvasC', 'canvasD'].forEach(canvasId => {
        if (data[canvasId]) {
            try {
                const base64Data = data[canvasId].replace(/^data:image\/png;base64,/, '');
                const buffer = Buffer.from(base64Data, 'base64');
                doc.addPage();
                doc.fontSize(14).font('Helvetica-Bold').text(Schema Posa ${canvasId.toUpperCase()});
                doc.image(buffer, { width: 450 });
            } catch (e) { console.log(Errore canvas ${canvasId}:, e.message); }
        }
    });

    // Serramenti (Array)
    const tipi = Array.isArray(data['tipo_serramento']) ? data['tipo_serramento'] : (data['tipo_serramento'] ? [data['tipo_serramento']] : []);
    if (tipi.length > 0) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Dettaglio Serramenti', { underline: true });
        
        tipi.forEach((tipo, idx) => {
            doc.moveDown();
            doc.fontSize(12).font('Helvetica-Bold').text(SERRAMENTO ${idx + 1});
            doc.fontSize(10).font('Helvetica');
            doc.text(Tipologia: ${tipo});
            doc.text(Misure: ${data['larghezza'][idx]}x${data['altezza'][idx]} mm);
            
            const canvasKey = canvasS${idx + 1};
            if (data[canvasKey]) {
                try {
                    const base64 = data[canvasKey].replace(/^data:image\/png;base64,/, '');
                    doc.image(Buffer.from(base64, 'base64'), { width: 300 });
                } catch (e) { console.log("Errore schema serramento", e.message); }
            }
        });
    }

    // FOTO (MODIFICA PUNTO 3 - OTTIMIZZAZIONE)
    if (files.length > 0) {
        files.forEach((file, idx) => {
            doc.addPage();
            doc.fontSize(14).font('Helvetica-Bold').text(Foto Cantiere ${idx + 1});
            doc.moveDown();
            try {
                doc.image(file.buffer, { fit: [500, 600], align: 'center', valign: 'center' });
            } catch (e) { 
                doc.text("Errore caricamento immagine.");
                console.log("Errore foto:", e.message); 
            }
        });
    }

    // Chiude il documento (scatena l'evento 'end' sopra)
    doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(Server attivo sulla porta ${PORT});
});
