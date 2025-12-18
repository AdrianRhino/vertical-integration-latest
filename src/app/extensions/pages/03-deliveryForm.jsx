import { Text, Select } from "@hubspot/ui-extensions";
import { deliveryComponent, deliveryRequiredFields } from "../helperFunctions/helper";
import { renderField } from "../helperFunctions/componentRender";
import AddressDisplay from "../helperFunctions/AddressDisplay";
import { useEffect, useState } from "react";

const DeliveryForm = ({ order, setOrder, runServerless, setCanGoNext }) => {
  const [productionTeam, setProductionTeam] = useState([]);
  const [isAddressEditing, setIsAddressEditing] = useState(false);

  // Load production team when page loads
  useEffect(() => {
    loadProductionTeam();
  }, []);

  // Simple validation: check if required fields are filled
  useEffect(() => {
    const delivery = order.delivery || {};
    const hasTeam = productionTeam.length > 0;
    
    // Check each required field
    let allFieldsFilled = true;
    for (let i = 0; i < deliveryRequiredFields.length; i++) {
      const fieldName = deliveryRequiredFields[i];
      const value = delivery[fieldName];
      if (!value || value === "") {
        allFieldsFilled = false;
        break;
      }
    }

    setCanGoNext(hasTeam && allFieldsFilled);
  }, [productionTeam.length, order.delivery, setCanGoNext]);

  // Simple function to load production team
  const loadProductionTeam = async () => {
    try {
      const response = await runServerless({ name: "getProductionTeam" });
      setProductionTeam(response.response.body.data || []);
    } catch (error) {
      console.error("Error loading production team:", error);
    }
  };

  // Simple function to update a field
  const updateField = (fieldName, value) => {
    setOrder((prev) => ({
      ...prev,
      delivery: {
        ...prev.delivery,
        [fieldName]: value,
      },
    }));
  };

  return (
    <>
      <Text>Delivery</Text>
      <Select
        label="Primary Contact"
        options={productionTeam}
        value={order.delivery?.primary_contact}
        onChange={(value) => {
          updateField("primary_contact", value);
        }}
      />
      {deliveryComponent
        .filter((field) => !["address_line_1", "city", "state", "zip_code"].includes(field.internalName))
        .map((field) =>
          renderField(
            field,
            null,
            null,
            order.delivery || {},
            updateField,
            null
          )
        )}
      <Text></Text>
      <AddressDisplay
        address={order.delivery || {}}
        onFieldChange={updateField}
        isEditing={isAddressEditing}
        onEdit={() => setIsAddressEditing(true)}
        onSave={() => setIsAddressEditing(false)}
      />
    </>
  );
};

export default DeliveryForm;
