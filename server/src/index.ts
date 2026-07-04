import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import chatRouter from './routes/chat.js';
import { ensureSampleFile } from './services/excel.service.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.use('/api', chatRouter);

ensureSampleFile();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
