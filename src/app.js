import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { RouterOSClient } from "routeros-client";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token == process.env.TOKEN) {
    next();
  } else {
    console.log(`Socket ${socket.id} unauthorized`);
    next(new Error('unauthorized'))
  }
});

const rooms = {};

io.on("connection", (socket) => {
  console.log(`Socket ${socket.id} connected`);
  let traffic;
  let api;

  socket.on("traffic-room", ({ host, mikrotikInterface }) => {
    if (!rooms[socket.id]) {
      rooms[socket.id] = new Set();
    }
    rooms[socket.id].add(socket);

    api = new RouterOSClient({
      host: host,
      user: process.env.API_USER,
      password: process.env.API_PASSWORD,
    });

    api
      .connect()
      .then((client) => {
        const monitorTraffic = client.menu("/interface monitor-traffic");
        traffic = monitorTraffic
          .where({
            interface: mikrotikInterface,
          })
          .stream((err, data) => {
            if (err) {
              console.log(err);
              return;
            }

            if (data && data.length > 0) {
              const { rxBitsPerSecond: rx, txBitsPerSecond: tx } = data[0];
              if (
                rooms[socket.id] &&
                typeof rooms[socket.id].forEach === "function"
              ) {
                rooms[socket.id].forEach((clientSocket) => {
                  clientSocket.emit("traffic", {
                    rx: rx,
                    tx: tx,
                  });
                });
              }
            }
          })
      })
      .catch((err) => {
        console.log(err);
      });
  });

  socket.on("disconnect", () => {
    console.log(`Socket ${socket.id} disconnect`);
    if (traffic) {
      traffic.close();
    }

    if (api) {
      api.close();
    }

    if (rooms) {
      Object.keys(rooms).forEach((room) => {
        if (rooms[room].has(socket)) {
          rooms[room].delete(socket);
          if (rooms[room].size === 0) {
            delete rooms[room];
          }
        }
      });
    }
  });
});

server.listen(process.env.PORT, () => {
  console.log(`listening on *:${process.env.PORT}`);
});
