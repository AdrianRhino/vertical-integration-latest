import { Text, Button, ButtonRow } from "@hubspot/ui-extensions";
import { formatAddressString } from "./helper";
import { renderField } from "./componentRender";

const AddressDisplay = ({ address = {}, onFieldChange, isEditing, onEdit, onSave }) => {
  const formattedAddress = formatAddressString(address);

  if (isEditing) {
    const addressFields = [
      {
        label: "Customer Address Confirmation",
        type: "input",
        required: false,
        internalName: "address_line_1",
        placeholder: "",
        view: true,
        script: "",
      },
      {
        label: "Customer City Confirmation",
        type: "input",
        required: false,
        internalName: "city",
        placeholder: "",
        view: true,
        script: "",
      },
      {
        label: "Customer State Confirmation",
        type: "input",
        required: false,
        internalName: "state",
        placeholder: "",
        view: true,
        script: "",
      },
      {
        label: "Customer Zip Code Confirmation",
        type: "input",
        required: false,
        internalName: "zip_code",
        placeholder: "",
        view: true,
        script: "",
      },
    ];

    return (
      <>
        {addressFields.map((field) =>
          renderField(
            field,
            null,
            null,
            address,
            onFieldChange,
            null
          )
        )}
        <ButtonRow>
          <Button variant="primary" onClick={onSave}>
            Save Address
          </Button>
        </ButtonRow>
      </>
    );
  }

  return (
    <>
      <Text format={{ fontWeight: "bold" }}>Delivery Address:</Text>
      <Text>{formattedAddress || "No address entered"}</Text>
      <Text></Text>
      <Button variant="secondary" onClick={onEdit}>
        Edit Address
      </Button>
    </>
  );
};

export default AddressDisplay;

