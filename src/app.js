import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { RouterOSClient } from "routeros-client";
import * as dotenv from "dotenv";
import authTokenMiddleware from "./middlewares/authTokenMiddleware.js";

dotenv.config();

const app = express();

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (token == process.env.SOCKET_TOKEN) {
    next();
  } else {
    console.log(`Socket ${socket.id} unauthorized`);
    next(new Error("unauthorized"));
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
          });
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

app.use(express.json());
app.use(authTokenMiddleware)

app.get("/interfaces",(req, res) => {
  const { host } = req.body;
  
  const api = new RouterOSClient({
    host: host,
    user: process.env.API_USER,
    password: process.env.API_PASSWORD,
  });

  api.connect()
    .then((client) => {
      const interfaceMenu = client.menu("/interface print");
      interfaceMenu.get()
        .then((data) => {
          
          const result = data.filter(obj => obj.type !== "pppoe-in" && obj.type !== "l2tp-in" && obj.type !== "sstp-out");

          res.status(200).send(result)

        })
        .catch((e) => {
          console.log(e);
          res.status(500).send("Error al obtener los datos de la interfaz.");
        })
        .finally(() => {
          api.close()
        });
    })
    .catch((e) => {
      console.log(e);
      res.status(500).send("Error al conectar con el dispositivo.");
    });
});

app.get("/resources",(req, res) => {
  const { host } = req.body;
  
  const api = new RouterOSClient({
    host: host,
    user: process.env.API_USER,
    password: process.env.API_PASSWORD,
  });

  api.connect()
    .then((client) => {
      const interfaceMenu = client.menu("/system/resource print");
      interfaceMenu.get()
        .then((data) => {

          res.status(200).send(data[0])
        })
        .catch((e) => {
          console.log(e);
          res.status(500).send("Error al obtener los recursos.");
        })
        .finally(() => {
          api.close()
        });
    })
    .catch((e) => {
      console.log(e);
      res.status(500).send("Error al conectar con el dispositivo.");
    });

  
});


server.listen(process.env.PORT, () => {
  console.log(`listening on *:${process.env.PORT}`);
});