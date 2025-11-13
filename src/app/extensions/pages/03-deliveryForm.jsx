import { Text, Select } from "@hubspot/ui-extensions";
import { deliveryComponent, deliveryRequiredFields } from "../helperFunctions/helper";
import { renderField } from "../helperFunctions/componentRender";
import { useEffect, useState } from "react";

const DeliveryForm = ({ fullOrder, setFullOrder, runServerless, parsedOrder, setNextButtonDisabled }) => {
  const [productionTeam, setProductionTeam] = useState([]);

  // Create a handler that updates the full order
  const handleFieldChange = (fieldName, value) => {
    setFullOrder((prev) => ({
      ...prev,
      delivery: {
        ...prev.delivery,
        [fieldName]: value,
      },
    }));
  };

useEffect(() => {
  const fetchProductionTeam = async () => {
    const response = await runServerless({
      name: "getProductionTeam",
    });
    setProductionTeam(response.response.body.data || []);
    console.log("Production team:", response.response.body.data);
  };

  fetchProductionTeam();
}, [runServerless]);

useEffect(() => {
  const mergedDelivery = {
    ...(parsedOrder?.delivery || {}),
    ...(fullOrder?.delivery || {}),
  };

  const hasProductionTeam = productionTeam.length > 0;
  const hasRequiredFields = deliveryRequiredFields.every((fieldKey) => {
    const value = mergedDelivery[fieldKey];
    return value !== undefined && value !== null && value !== "";
  });

  if (hasProductionTeam && hasRequiredFields) {
    setNextButtonDisabled(false);
  } else {
    setNextButtonDisabled(true);
  }
}, [
  productionTeam.length,
  fullOrder?.delivery?.primary_contact,
  fullOrder?.delivery?.delivery_type,
  fullOrder?.delivery?.time_code,
  parsedOrder?.delivery?.primary_contact,
  parsedOrder?.delivery?.delivery_type,
  parsedOrder?.delivery?.time_code,
  setNextButtonDisabled,
]);

  return (
    <>
      <Text>Delivery</Text>
      <Select
        label="Primary Contact" // pull from hubspot teams
        options={productionTeam}
        value={fullOrder?.delivery?.primary_contact || parsedOrder?.delivery?.primary_contact}
        onChange={(val) => {
          handleFieldChange("primary_contact", val);
          setFullOrder((prev) => ({
            ...prev,
            delivery: {
              ...prev.delivery,
              primary_contact: val,
            },
          }));
        }}
      />
      {deliveryComponent.map((field) =>
        renderField(
          field,
          null, // dropdownOptions
          null, // ownerOptions
          fullOrder?.delivery || parsedOrder?.delivery || {}, // formData
          handleFieldChange, // setFormData function
          null // contactValues
        )
      )}
    </>
  );
};

export default DeliveryForm;
