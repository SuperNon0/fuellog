const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');

// S'assurer que le dossier des pièces jointes existe
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/pleins', require('./routes/pleins'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/favoris', require('./routes/favoris'));
app.use('/api/entretiens', require('./routes/entretiens'));

app.listen(PORT, () => console.log('FuelLog running on port ' + PORT));
