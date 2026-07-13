export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: "Missing Supabase configuration environment variables." });
  }

  const { phone } = req.query;

  // 1. GET REQUEST (Read State)
  if (req.method === 'GET') {
    if (!phone) {
      return res.status(400).json({ error: "Missing phone parameter" });
    }

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/states?phone=eq.${encodeURIComponent(phone)}&select=state`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase error ${response.status}: ${errText}`);
      }

      const data = await response.json();
      if (data && data.length > 0) {
        return res.status(200).json(data[0].state);
      } else {
        return res.status(404).json({ error: "User profile not found" });
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // 2. POST REQUEST (Write State)
  if (req.method === 'POST') {
    let bodyData;
    if (typeof req.body === 'string') {
      try {
        bodyData = JSON.parse(req.body);
      } catch (e) {
        bodyData = req.body;
      }
    } else {
      bodyData = req.body;
    }

    const phoneField = bodyData.phone;
    if (!phoneField) {
      return res.status(400).json({ error: "Missing phone field in request body" });
    }

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/states`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          phone: phoneField,
          state: bodyData,
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase error ${response.status}: ${errText}`);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
