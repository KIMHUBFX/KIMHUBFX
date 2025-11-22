import { Worker, Queue } from 'bullmq';
import { connectWebSocket } from '../services/deriv';
import prisma from '../prismaClient';

const botQueue = new Queue('botQueue');

export const worker = new Worker('botQueue', async job => {
  const { botId } = job.data;
  const bot = await prisma.bot.findUnique({ where: { id: botId }, include: { strategy: true } });
  if (!bot) throw new Error('Bot not found');

  const ws = connectWebSocket(process.env.DERIV_API_TOKEN!);

  ws.on('message', async (msg) => {
    const data = JSON.parse(msg.toString());
    // Execute bot strategy logic (stub example)
    if (data.tick && bot.strategy.config) {
      // Evaluate condition and place trade
      console.log('Executing bot logic...');
    }
  });
});

export default botQueue;
