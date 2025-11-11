import { Text, Select } from "@hubspot/ui-extensions";
import { deliveryComponent } from "../helperFunctions/helper";
import { renderField } from "../helperFunctions/componentRender";
import { useEffect, useState } from "react";

const DeliveryForm = ({ fullOrder, setFullOrder, runServerless, parsedOrder }) => {
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
      setProductionTeam(response.response.body.data);
      console.log("Production team:", response.response.body.data);
    };

    fetchProductionTeam();
    console.log("fullOrder", fullOrder);
    console.log("parsedOrder", parsedOrder);
  }, []);

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
