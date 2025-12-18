import { Illustration, Text, Flex } from "@hubspot/ui-extensions";

const OrderSuccessPage = ({ setCurrentPage }) => {
  return (
    <>
      <Flex direction="column" justify="center" align="center">
        <Text>Order Success Page</Text>
        <Illustration name="successfullyConnectedEmail" />
      </Flex>
    </>
  );
};

export default OrderSuccessPage;