exports.main = async (context) => {
  const token = process.env.HUBSPOT_API_KEY;

  const dealId = context.parameters.context.crm.objectId;

  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v4/objects/deals/${dealId}/associations/tickets`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await res.json();
    const ticketIds = (data.results || []).map((r) => r.toObjectId);

    const ticketInfo = await fetch(
      `https://api.hubapi.com/crm/v3/objects/tickets/batch/read`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: ticketIds.map((id) => ({ id: String(id) })),
          properties: ["job_type"],
        }),
      }
    );

    const ticketInfoData = await ticketInfo.json();

    const results = ticketInfoData.results || [];

    const tickets = results
      .map((r) => ({
        label: r.properties.job_type ?? "(No Job Type)",
        value: r.id,
      }))
      .filter((o) => o.value)
      .sort((a, b) => a.label.localeCompare(b.label));

    // console.log('Tickets:', tickets);

    return {
      statusCode: 200,
      body: { tickets },
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    console.error("❌ Error fetching tickets:", error.message);
    return {
      statusCode: 500,
      body: { error: error.message },
    };
  }
};
