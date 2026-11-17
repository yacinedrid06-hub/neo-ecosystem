const { createApp } = require("./app");
const { createDatabase } = require("./db");

const db = createDatabase();
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "0.0.0.0";
const server = createApp({ db }).listen(port, host, () => {
  console.log(`NEO is listening on http://${host}:${port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
