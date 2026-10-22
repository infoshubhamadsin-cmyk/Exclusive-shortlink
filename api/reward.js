const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    // Sirf POST request allow karein
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { short_id, clicker_tg_id } = req.body;

    if (!short_id) {
        return res.status(400).json({ error: 'short_id is required' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Server environment variables missing' });
    }

    const cleanUrl = supabaseUrl.trim().replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

    try {
        const supabase = createClient(cleanUrl, supabaseKey.trim());

        // 1. Link Data Fetch karein
        const { data: linkData, error: linkErr } = await supabase
            .from('links')
            .select('*')
            .eq('short_id', short_id)
            .single();

        if (linkErr || !linkData) {
            return res.status(404).json({ error: 'Link not found' });
        }

        // 2. Admin Settings se Live CPM rate nikalein
        const { data: adminSettings } = await supabase
            .from('settings')
            .select('*')
            .limit(1)
            .single();

        const cpm = adminSettings && adminSettings.cpm ? adminSettings.cpm : 2.0;
        const earn_amount = cpm / 1000;

        // 3. Click Log add karein
        if (clicker_tg_id) {
            await supabase.from('click_logs').insert([{
                link_id: linkData.id,
                clicker_tg_id: clicker_tg_id
            }]);
        }

        // 4. Links Table me Click aur Earning update karein
        await supabase.from('links').update({
            clicks: (linkData.clicks || 0) + 1,
            earnings: (linkData.earnings || 0) + earn_amount
        }).eq('id', linkData.id);

        // 5. Link Creator (User) ka Balance aur Today Earnings badhayein
        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', linkData.user_id)
            .single();
        
        if (userData) {
            await supabase.from('users').update({
                balance: (userData.balance || 0) + earn_amount,
                today_earnings: (userData.today_earnings || 0) + earn_amount,
                total_earnings: (userData.total_earnings || 0) + earn_amount,
                total_clicks: (userData.total_clicks || 0) + 1,
                today_clicks: (userData.today_clicks || 0) + 1
            }).eq('id', userData.id);
        }

        return res.status(200).json({ success: true, message: 'Reward added successfully' });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
