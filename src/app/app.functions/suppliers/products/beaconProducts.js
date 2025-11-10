const axios = require("axios");

exports.main = async (context) => {
  console.log("Beacon Products...");

  const cookies = context.parameters.cookies;

  try {
    const beaconProducts = await axios.get(
      "https://beaconproplus.com/v1/rest/com/becn/itemlist",
      {
        headers: {
          Cookie: cookies,
        },
        params: {
          accountId: "557799"
        }
      }
    );

    return {
      message: "Beacon Products fetched successfully",
      products: beaconProducts.data,
    };
  } catch (error) {
    console.error("Error in Beacon Products:", error);
    throw new Error("Beacon Products fetch failed");
  }
};
