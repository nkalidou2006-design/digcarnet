// Fonction serveur (ne s'affiche jamais dans le navigateur du boutiquier)
// Vercel la deploie automatiquement car elle se trouve dans le dossier /api

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  const { phone, message, appSecret } = req.body || {};

  // Verification simple pour eviter que n'importe qui appelle cette fonction
  if (appSecret !== process.env.APP_SECRET) {
    return res.status(401).json({ error: 'Non autorise' });
  }

  if (!phone || !message) {
    return res.status(400).json({ error: 'Numero ou message manquant' });
  }

  const CLIENT_ID = process.env.ORANGE_CLIENT_ID;
  const CLIENT_SECRET = process.env.ORANGE_CLIENT_SECRET;
  const SENDER_NUMBER = process.env.ORANGE_SENDER_NUMBER; // ex: 221771234567, sans le +

  try {
    // Etape 1 : obtenir un jeton d'acces aupres d'Orange
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenResp = await fetch('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: 'grant_type=client_credentials'
    });
    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return res.status(502).json({ error: 'Impossible de s\'authentifier aupres d\'Orange', httpStatus: tokenResp.status, details: tokenData });
    }

    // Etape 2 : nettoyer le numero du client (garder que les chiffres, ajouter indicatif 221 si absent)
    let cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.slice(1);
    if (!cleanPhone.startsWith('221')) cleanPhone = '221' + cleanPhone;

    // Etape 3 : envoyer le SMS
    const smsResp = await fetch(
      `https://api.orange.com/smsmessaging/v1/outbound/tel:+${SENDER_NUMBER}/requests`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          outboundSMSMessageRequest: {
            address: `tel:+${cleanPhone}`,
            senderAddress: `tel:+${SENDER_NUMBER}`,
            outboundSMSTextMessage: { message }
          }
        })
      }
    );

    if (smsResp.status === 201 || smsResp.status === 200) {
      return res.status(200).json({ success: true });
    } else {
      const errData = await smsResp.json().catch(() => ({}));
      return res.status(502).json({ error: 'Echec de l\'envoi du SMS', details: errData });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
