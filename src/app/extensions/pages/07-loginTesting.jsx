import { Text, Button, hubspot } from "@hubspot/ui-extensions";
import { useState, useEffect } from "react";

const LoginTesting = () => {
    const [abcLoginToken, setAbcLoginToken] = useState(null);
    const [abcLoginTokenSandbox, setAbcLoginTokenSandbox] = useState(null);
    const [abcLoginTokenError, setAbcLoginTokenError] = useState(null);
    const [abcLoginTokenSandboxError, setAbcLoginTokenSandboxError] = useState(null);

    const testABCLogin = async () => {
        try {
            const abcLoginToken = await hubspot.serverless("abcLogin");
            setAbcLoginToken(abcLoginToken);
        } catch (error) {
            setAbcLoginTokenError(error);
        }
    }
    const testABCLoginSandbox = async () => {
        console.log("Testing ABC Login Sandbox...");
        try {
            console.log("Calling ABC Login Sandbox...");
            const abcLoginTokenSandbox = await hubspot.serverless("abcLoginSandbox");
            setAbcLoginTokenSandbox(abcLoginTokenSandbox);
            console.log("ABC Login Sandbox Token:", abcLoginTokenSandbox);
        } catch (error) {
            setAbcLoginTokenSandboxError(error);
        }
    }

    const testAuth = async () => {
        try {
            const authResponse = await hubspot.serverless("testAuth");
            console.log("Auth response:", authResponse);
        } catch (error) {
            console.error("Error in Test Auth:", error);
        }
    }
 

  return (
    <>
      <Text>Login Testing</Text>
      <Button onClick={testABCLoginSandbox}>Login to ABC</Button>
      <Button>Login to SRS</Button>
      <Button>Login to Beacon</Button>
      <Button onClick={testAuth}>Test Auth</Button>
    </>
  );
};

export default LoginTesting;