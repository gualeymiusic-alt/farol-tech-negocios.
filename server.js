/**
 * 🐂 FAROL TECH & NEGOCIOS — V1.0 (PRODUCCIÓN CONTROLADA)
 * --------------------------------------------------------
 * 🛠️ CONFIGURACIÓN:
 * 1. IA: Rotación de 2 llaves Gemini (API_KEY y KEY_2).
 * 2. TIEMPO: Publicación automática cada 8 horas (00:00, 08:00, 16:00).
 * 3. PUERTO: 8080 para Railway.
 * --------------------------------------------------------
 */

const express   = require('express');
const path      = require('path');
const cron      = require('node-cron');
const { Pool }  = require('pg');
const sharp     = require('sharp');
const fs        = require('fs');
const { GoogleGenerativeAI } = require('@google-ai/generativai');

const app      = express();
const PORT     = process.env.PORT || 8080;

// Configuración de Base de Datos
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ══════════════════════════════════════════════════════════
// 🔑 ROTACIÓN DE 2 LLAVES (SÓLO LAS QUE TIENES)
// ══════════════════════════════════════════════════════════
async function llamarIATech(prompt) {
    const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_KEY_2].filter(Boolean);
    
    if (keys.length === 0) return null;

    // Rotación: Llave 1 en horas par, Llave 2 en horas impar
    const keyActual = (new Date().getHours() % 2 === 0) ? keys[0] : (keys[1] || keys[0]);

    try {
        const genAI = new GoogleGenerativeAI(keyActual);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (e) {
        console.error('Error IA:', e.message);
        return null;
    }
}

// ══════════════════════════════════════════════════════════
// 📰 GENERADOR DE ARTÍCULOS (CON MARCA DE AGUA)
// ══════════════════════════════════════════════════════════
async function generarArticuloEstructurado(tema) {
    console.log(`🐂 El Toro está redactando sobre: ${tema}...`);
    
    const promptIA = `Eres analista de Farol Tech. Escribe un artículo de economía y tecnología sobre "${tema}" para RD. 
    Responde SOLO en este formato JSON: {"titulo": "...", "resumen": "...", "contenido": "...", "query": "business technology"}`;

    try {
        const respuesta = await llamarIATech(promptIA);
        if (!respuesta) return;

        const data = JSON.parse(respuesta);
        const slug = data.titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        // Aquí iría tu lógica de imagen/Wikimedia + Sharp que ya tenemos...
        // (Para no sobrecargar el servidor, Sharp procesa aquí con el watermark.png)

        const queryDB = `INSERT INTO articulos (titulo, slug, resumen, contenido_html, fecha_publicacion) VALUES ($1, $2, $3, $4, NOW())`;
        await pool.query(queryDB, [data.titulo, slug, data.resumen, data.contenido]);
        
        console.log(`✅ Noticia publicada: ${data.titulo}`);
    } catch (e) {
        console.error('Error al generar:', e.message);
    }
}

// ══════════════════════════════════════════════════════════
// ⏱️ CONTROL DE TIEMPO (CRON) - NO ESCRIBIR COMO LOCA
// ══════════════════════════════════════════════════════════
// Configurado para cada 8 horas: 00:00, 08:00 y 16:00
cron.schedule('0 */8 * * *', async () => {
    const temas = ["Mercado de Valores RD", "Criptomonedas", "Fintech en SDE", "IA en Negocios"];
    const tema = temas[Math.floor(Math.random() * temas.length)];
    await generarArticuloEstructurado(tema);
});

// 🌐 RUTAS WEB
app.use(express.static(path.join(__dirname, 'client')));
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Farol Tech en puerto ${PORT}. 🐂 El Toro publicará cada 8 horas.`);
});
