// Module: functions/handleDrafts
// Shape:
//   Input:    dealId from UI
//   Filter:   validate dealId
//   Transform: fetch orders from HubSpot
//   Store:    none (just fetch)
//   Output:   { ok, orders[] }
//   Loop:     none
// Interfaces: dealId -> { ok, orders[] } (errors: explicit messages)
// Config: HubSpot API endpoints (optional JSON)
// Notes: loads orders from HubSpot for a specific deal


exports.main = async (context) => {
  
    console.log("🚀 getDraftOrders function started");
    console.log("Deal ID:", context.parameters.context.crm.objectId);
    console.log("Order Type:", context.parameters.status);

    try {

        const dealId = context.parameters.context.crm.objectId;
        const status = context.parameters.status;

        if (!dealId) {
            return {
                statusCode: 400,
                body: {
                    ok: false,
                    error: "dealId is required"
                }
            }
        }

        const associatedOrdersResponse = await fetch(`https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/2-22239999`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${process.env.HUBSPOT_API_KEY}`,
                "Content-Type": "application/json"
            },
        })
        const associatedOrders = await associatedOrdersResponse.json();
        console.log("associatedOrders", associatedOrders);
        
        
        if (!associatedOrders.results || associatedOrders.results.length === 0) {
            return {
                statusCode: 200,
                body: {
                    ok: true,
                    associatedOrders: associatedOrders
                }
            }
        }

        const orderIds = associatedOrders.results.map((assoc) => assoc.toObjectId);
        console.log("📋 Order IDs to fetch:", orderIds);

        // Make ONE batch request for all orders
        const orderResponse = await fetch(`https://api.hubapi.com/crm/v3/objects/2-22239999/batch/read`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.HUBSPOT_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                inputs: orderIds.map((id) => ({ id: String(id) })),
                properties: ["order_number", "status", "total", "payload_snapshot"]
            })
        });
        
        const orderResponseData = await orderResponse.json();
        console.log("📊 Order response:", orderResponseData);

        // Transform to dropdown format
        const orderOptions = orderResponseData.results.map(order => ({
            label: order.properties.order_number || `Order ${order.id}`,
            value: order
        }));

        return {
            statusCode: 200,
            body: {
                ok: true,
                orders: orderOptions,
                totalOrders: orderOptions.length,
                dealId: dealId
            }
        }
       
} catch (error) {
    console.error("❌ Error:", error.message);
    return {
        statusCode: 500,
        body: {
            ok: false,
            error: error.message
        }
    }
}
}

