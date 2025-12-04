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
        console.log("Testing ABC Login (uses environment.json setting)...");
        try {
            console.log("Calling ABC Login (unified, reads from environment.json)...");
            const abcLoginTokenSandbox = await hubspot.serverless("abcLogin");
            setAbcLoginTokenSandbox(abcLoginTokenSandbox);
            console.log("ABC Login Token:", abcLoginTokenSandbox);
        } catch (error) {
            setAbcLoginTokenSandboxError(error);
        }
    }
 

  return (
    <>
      <Text>Login Testing</Text>
      <Text>Note: All logins now use unified functions that read from environment.json</Text>
      <Button onClick={testABCLogin}>Login to ABC (Prod)</Button>
      <Button onClick={testABCLoginSandbox}>Login to ABC (Environment-based)</Button>
      <Button>Login to SRS</Button>
      <Button>Login to Beacon</Button>
    </>
  );
};

export default LoginTesting;