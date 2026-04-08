const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const axios = require('axios');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.get('/ping', (req, res) => {
    res.sendStatus(200);
});

app.post('/invia', upload.single('pdf'), async (req, res) => {
    try {
    if (!req.file || req.file.mimetype !== 'application/pdf') {
    return res.status(400).send("PDF non valido");
}

        const pdfBuffer = req.file.buffer;
        const base64PDF = pdfBuffer.toString('base64');

        const data = req.body;
        const oggi = new Date().toLocaleDateString('it-IT');

        await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: { 
                name: "App Rilievi", 
                email: "arredoinfissitorino@gmail.com" 
            },
            to: [{ email: "arredoinfissitorino@gmail.com" }],
            subject: `Rilievo ${data.cliente_nome || "Cliente"} - ${oggi}`,
            textContent: "Rilievo generato da app",
            attachment: [
                { 
                    content: base64PDF, 
                    name: `Rilievo_${data.cliente_nome || "cliente"}.pdf` 
                }
            ]
        }, {
            headers: { 
                'api-key': process.env.BREVO_API_KEY, 
                'Content-Type': 'application/json' 
            }
        });

        console.log("✅ Email inviata!");
        res.send("PDF inviato correttamente!");

    } catch (error) {
        console.error("Errore invio:", error.response?.data || error.message);
        res.status(500).send("Errore invio email");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('Server attivo sulla porta: ' + PORT);
});
