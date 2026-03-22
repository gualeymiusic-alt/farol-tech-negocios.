const express = require('express');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { Pool } = require('pg');

chromium.use(stealth);
const app = express();
app.use(express.json());

const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
});

// --- RUTA PÚBLICA (Tu página de Farol Solution) ---
app.get('/', (req, res) => {
    res.send(`
    <body style="background:#000; color:#ff8c00; text-align:center; font-family:sans-serif; padding-top:50px;">
        <h1>🏮 FAROL-X HÍBRIDO ACTIVO</h1>
        <p style="color:#fff;">Noticias IA + Automatización Sigilosa en ejecución.</p>
        <div style="border:1px solid #333; padding:20px; display:inline-block; border-radius:10px;">
            <p>Estado del Ingeniero: ✅ Operativo</p>
            <p>Nivel de Sigilo: ⚡ Máximo (iPhone Emulation)</p>
        </div>
    </body>`);
});

// --- MÓDULO X: EL BOT QUE SUPERA AL OTRO ---
async function botSuperior(email, pass) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15...',
        viewport: { width: 393, height: 852 },
        isMobile: true
    });
    const page = await context.newPage();
    try {
        await page.goto('https://www.shein.com/user/auth/login');
        await page.type('input[type="email"]', email, { delay: 100 });
        await page.type('input[type="password"]', pass, { delay: 150 });
        await page.click('.login-button');
        await page.waitForTimeout(5000);
        const wallet = await page.innerText('.wallet-balance').catch(() => "0.00");
        await browser.close();
        return { status: "HIT", balance: wallet };
    } catch (e) {
        await browser.close();
        return { status: "RETRY", error: "Captcha Detectado" };
    }
}

// Endpoint para que lo actives desde tu móvil
app.post('/api/x/start', async (req, res) => {
    if (req.body.pin !== '311') return res.status(403).send('PIN Erróneo');
    botSuperior(req.body.user, req.body.pass).then(r => console.log("Resultado:", r));
    res.json({ msg: "Bot X iniciado en segundo plano" });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🏮 Farol-X en puerto ${PORT}`));
