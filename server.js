const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/pleins', require('./routes/pleins'));
app.use('/api/stations', require('./routes/stations'));
app.use('/api/favoris', require('./routes/favoris'));

app.listen(3000, () => console.log('FuelLog running on port 3000'));
