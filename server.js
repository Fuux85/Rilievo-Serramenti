const express = require('express');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const axios = require('axios'); // Libreria fondamentale per le API

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.post('/invia', upload.array('foto[]'), (req, res) => {
    const data = req.body;
    const files = req.files || [];

    console.log('=== NUOVO RILIEVO RICEVUTO (VIA API) ===');
    
    const doc = new PDFDocument({ bufferPages: true, margin: 30 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        const pdfBase64 = pdfData.toString('base64');

        // PREPARAZIONE DATI PER API BREVO
        const emailData = {
            sender: { name: "App Rilievi", email: "arredoinfissitorino@gmail.com" },
            to: [{ email: "arredoinfissitorino@gmail.com" }],
            subject: "Rilievo Serramenti - " + (data.cliente_nome || "Nuovo Cliente"),
            textContent: "In allegato il rilievo tecnico compilato.\nTecnico: " + (data.tecnico_incaricato || "N/A"),
            attachment: [{
                content: pdfBase64,
                name: "rilievo_" + (data.cliente_nome || "documento") + ".pdf"
            }]
        };

        // CHIAMATA API A BREVO
        axios.post('https://api.brevo.com/v3/smtp/email', emailData, {
            headers: {
                'api-key': process.env.BREVO_API_KEY, // Assicurati che su Render si chiami così
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            console.log('SUCCESSO: Email inviata tramite API Brevo');
            if (!res.headersSent) res.send('PDF inviato correttamente!');
        })
        .catch(error => {
            console.error('ERRORE API BREVO:', error.response ? error.response.data : error.message);
            if (!res.headersSent) res.status(500).send("Errore nell'invio tramite API.");
        });
    });

    // --- COSTRUZIONE DEL PDF ---
    doc.fontSize(20).text('Rilievo Serramenti', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica-Bold').text('Info Cantiere', { underline: true });
    doc.fontSize(12).font('Helvetica');
    doc.text('Data Rilievo: ' + (data.data_rilievo || 'N/A'));
    doc.text('Tecnico: ' + (data.tecnico_incaricato || 'N/A'));
    doc.text('Cliente: ' + (data.cliente_nome || 'N/A'));
    doc.text('Indirizzo: ' + (data.indirizzo_cliente || 'N/A'));
    doc.moveDown();

    // Canvas Schemi Posa
    ['canvasA', 'canvasB', 'canvasC', 'canvasD'].forEach(function(canvasId) {
        if (data[canvasId]) {
            try {
                const base64Data = data[canvasId].replace(/^data:image\/png;base64,/, '');
                doc.addPage();
                doc.fontSize(14).font('Helvetica-Bold').text('Schema Posa ' + canvasId.toUpperCase());
                doc.image(Buffer.from(base64Data, 'base64'), { width: 450 });
            } catch (e) { console.log("Errore canvas", e.message); }
        }
    });

    // Dettaglio Serramenti
    const tipi = Array.isArray(data['tipo_serramento']) ? data['tipo_serramento'] : (data['tipo_serramento'] ? [data['tipo_serramento']] : []);
    if (tipi.length > 0) {
        doc.addPage();
        doc.fontSize(14).font('Helvetica-Bold').text('Dettaglio Serramenti', { underline: true });
        tipi.forEach(function(tipo, idx) {
            doc.moveDown();
            doc.fontSize(12).font('Helvetica-Bold').text('SERRAMENTO ' + (idx + 1));
            doc.fontSize(10).font('Helvetica');
            doc.text('Tipologia: ' + tipo);
            doc.text('Misure: ' + (data['larghezza'] ? data['larghezza'][idx] : '?') + ' x ' + (data['altezza'] ? data['altezza'][idx] : '?') + ' mm');
            
            const canvasKey = 'canvasS' + (idx + 1);
            if (data[canvasKey]) {
                try {
                    const base64 = data[canvasKey].replace(/^data:image\/png;base64,/, '');
                    doc.image(Buffer.from(base64, 'base64'), { width: 300 });
                } catch (e) { console.log("Errore schema serramento", e.message); }
            }
        });
    }

    // Foto
    if (files.length > 0) {
        files.forEach(function(file, idx) {
            doc.addPage();
            doc.fontSize(14).font('Helvetica-Bold').text('Foto Cantiere ' + (idx + 1));
            doc.image(file.buffer, { fit: [500, 600], align: 'center' });
        });
    }

    doc.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('Server attivo sulla porta: ' + PORT); });
