import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

app.use('/api/wb', async (req, res) => {
  try {
    const url = `https://advert-api.wildberries.ru${req.path}`;
    const response = await axios({
      method: req.method,
      url: url,
      headers: {
        'Authorization': req.headers['authorization'],
        'Content-Type': 'application/json',
      },
      params: req.query,
      data: req.body,
    });
    res.json(response.data);
  } catch (error) {
    res.status(error.response?.status || 500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

app.listen(PORT, () => {
  console.log(`Прокси-сервер запущен на http://localhost:${PORT}`);
});
