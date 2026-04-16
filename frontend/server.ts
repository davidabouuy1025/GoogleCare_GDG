import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const PYTHON_FLASK_URL = "http://localhost:5000";

  app.use(express.json({ limit: "20mb" })); // needed for base64 images

  // ── Health check ──────────────────────────────────────────────
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // ── Python model status ───────────────────────────────────────
  app.get("/api/python/health", async (req, res) => {
    try {
      const response = await fetch(`${PYTHON_FLASK_URL}/health`);
      const data = await response.json();
      res.json(data);
    } catch {
      res.status(503).json({ status: "offline", error: "Python server unreachable" });
    }
  });

  // ── Proxy wound analysis to Flask ─────────────────────────────
  app.post("/api/python/analyze", async (req, res) => {
    try {
      const response = await fetch(`${PYTHON_FLASK_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        const err = await response.json();
        return res.status(response.status).json(err);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.status(503).json({
        success: false,
        error: "Python server unreachable. Make sure to run: python server.py",
      });
    }
  });

  // ── Vite / static ─────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`GoogleCare Server running on http://localhost:${PORT}`);
  });
}

startServer();