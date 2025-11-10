const axios = require("axios");

exports.main = async (context = {}) => {

    const SUPABASE_URL = `https://schgpocwipjspgwacidv.supabase.co`;
    const SUPABASE_KEY = process.env.SUPABASEKEY;

    async function fetchProducts(searchTerm = "") {
        const query = new URLSearchParams({
            select: "supplier,itemnumber,itemdescription",
            limit: "20",
        });

        if (searchTerm) {
            query.append("supplier", `ilike.${searchTerm}%`);
        }

        const res = await  fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            }
        });

        if (!res.ok) {
            console.error("Failed to fetch products:", res.status, await res.text());
            return [];
        }

        const data = await res.json();
        console.log("Products:", data);
        return data;
    }

    const products = await fetchProducts("abc");
    console.log("Products:", products);
    return products;
};

exports.main();
