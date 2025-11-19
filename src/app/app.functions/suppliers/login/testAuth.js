

exports.main = async () => {

    console.log("Test Auth Function");
    console.log("ABCKey:", process.env.ABCKEY);
    console.log('ABCKey Prod:', process.env.ABCKEY_PROD);

    return {
        success: true,
        message: "Test Auth Function",
        data: "Test Auth Function",
    };
}