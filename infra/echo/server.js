const { WebSocketServer } = require('ws');

const id = process.env.INSTANCE || 'app';
const wss = new WebSocketServer({ port: 3000 });

wss.on('connection', (ws) => {
  ws.send('connecte a ' + id);
  ws.on('message', (message) => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) client.send('[' + id + '] ' + message);
    });
  });
});