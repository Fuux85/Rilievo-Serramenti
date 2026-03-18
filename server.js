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
    doc.fontSize(20).font('Helvetica-Bold').text('Rilievo Serramenti', { align: 'center' });
    doc.moveDown();
    
    // 1. INFO CANTIERE
    doc.fontSize(14).font('Helvetica-Bold').text('Info Cantiere', { underline: true });
    doc.fontSize(12).font('Helvetica');
    doc.text('Data Rilievo: ' + (data.data_rilievo || 'N/A'));
    doc.text('Tecnico: ' + (data.tecnico_incaricato || 'N/A'));
    doc.text('Cliente: ' + (data.cliente_nome || 'N/A'));
    doc.text('Venditore: ' + (data.venditore || 'N/A'));
    doc.text('Indirizzo: ' + (data.indirizzo_cliente || 'N/A'));
    doc.text('Piano: ' + (data.piano || 'N/A'));
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Logistica e Accesso:');
    doc.font('Helvetica');
    doc.text('- Autoscala: ' + (data.autoscala || 'Non specificato'));
    doc.text('- Occupazione suolo pubblico: ' + (data.occupazione_suolo || 'Non specificato'));
    doc.text('- Ascensore: ' + (data.ascensore || 'Non specificato'));
    doc.text('- ZTL: ' + (data.ztl || 'Non specificato'));
    doc.moveDown();

    // 2. SCHEMI DI POSA (Canvas A, B, C, D)
    ['canvasA', 'canvasB', 'canvasC', 'canvasD'].forEach(function(id) {
        if (data[id] && data[id].includes('base64')) {
            try {
                const base64Data = data[id].replace(/^data:image\/png;base64,/, '');
                doc.addPage();
                doc.fontSize(14).font('Helvetica-Bold').text('Schema Posa ' + id.replace('canvas', ''));
                doc.image(Buffer.from(base64Data, 'base64'), { width: 450 });
            } catch (e) { console.log("Errore canvas posa", e.message); }
        }
    });

    // 3. DETTAGLIO SERRAMENTI (Gestione Multipla Sicura)
    const toArray = (val) => Array.isArray(val) ? val : (val ? [val] : []);

    const tipi = toArray(data['tipo_serramento[]']);
    const nomi = toArray(data['nome_serramento[]']);
    const largh = toArray(data['larghezza[]']);
    const alt = toArray(data['altezza[]']);
    const aperture = toArray(data['apertura[]']);
    const vetri = toArray(data['vetro[]']);
    const note = toArray(data['note[]']);

    if (tipi.length > 0) {
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('Dettaglio Serramenti', { underline: true });
        
        tipi.forEach(function(tipo, idx) {
            doc.moveDown();
            doc.fontSize(12).font('Helvetica-Bold').text('SERRAMENTO ' + (idx + 1) + ': ' + (nomi[idx] || 'N/D'));
            doc.fontSize(10).font('Helvetica');
            doc.text('Tipologia: ' + tipo);
            doc.text('Misure: ' + (largh[idx] || '?') + ' x ' + (alt[idx] || '?') + ' mm');
            doc.text('Apertura: ' + (aperture[idx] || 'N/D') + ' | Vetro: ' + (vetri[idx] || 'N/D'));
            if(note[idx]) doc.text('Note: ' + note[idx]);
            
            // Disegno del serramento specifico
            const canvasKey = 'canvasS' + (idx + 1);
            if (data[canvasKey] && data[canvasKey].includes('base64')) {
                try {
                    const base64 = data[canvasKey].replace(/^data:image\/png;base64,/, '');
                    doc.image(Buffer.from(base64, 'base64'), { width: 250 });
                } catch (e) { console.log("Errore disegno serramento", e.message); }
            }
            doc.text('--------------------------------------------------');
        });
    }

   // 4. FOTO CANTIERE
    if (files && files.length > 0) {
        files.forEach(function(file, idx) {
            try {
                doc.addPage();
                doc.fontSize(14).font('Helvetica-Bold').text('Foto Cantiere ' + (idx + 1));
                doc.image(file.buffer, { fit: [500, 600], align: 'center' });
            } catch (e) {
                console.log("Errore inserimento foto:", e.message);
            }
        });
    }

    // Chiudiamo il PDF
    doc.end();

    // Invio tramite Brevo quando il PDF è pronto
    doc.on('end', async () => {
        try {
            const pdfBuffer = Buffer.concat(buffers);
            const base64PDF = pdfBuffer.toString('base64');

            await axios.post('https://api.brevo.com/v3/smtp/email', {
                sender: { name: "Rilievo App", email: "arredoinfissitorino@gmail.com" },
                to: [{ email: "arredoinfissitorino@gmail.com" }],
                subject: "Nuovo Rilievo: " + (data.cliente_nome || "Senza Nome"),
                textContent: "In allegato il PDF del rilievo.",
                attachment: [{ content: base64PDF, name: "Rilievo_" + (data.cliente_nome || "cliente") + ".pdf" }]
            }, {
                headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' }
            });

            console.log("Email inviata con successo!");
            if (!res.headersSent) res.send("PDF inviato correttamente via email!");
        } catch (error) {
            console.error("Errore Brevo:", error.response ? error.response.data : error.message);
            if (!res.headersSent) res.status(500).send("Errore nell'invio dell'email.");
        }
    });

}); // <--- QUESTA chiude app.post('/invia', ...)

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() { 
    console.log('Server attivo sulla porta: ' + PORT); 
});
