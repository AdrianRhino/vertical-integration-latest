import { Select } from "@hubspot/ui-extensions";
import { supplierOptions, templateOptions } from "../helperFunctions/appOptions";
import { useEffect, useState } from "react";

const PickSetup = ({ context, setFullOrder, runServerless, fullOrder, parsedOrder, setNextButtonDisabled }) => {

  const [tickets, setTickets] = useState([]);

  const getTickets = async () => {
    try {
      const response = await runServerless({
        name: "getTickets",
        parameters: { context },
      });
      console.log("tickets: ", response);
      setTickets(response.response.body.tickets);
    } catch (err) {
      console.error("Error fetching tickets:", err);
    }
  }

  useEffect(() => {
    getTickets();
  }, []);

  useEffect(() => {
    if (fullOrder.ticket && fullOrder.supplier && fullOrder.template) {
      setNextButtonDisabled(false);
    } else {
      setNextButtonDisabled(true);
    }
  }, [fullOrder.ticket, fullOrder.supplier, fullOrder.template]);

  return (
    <>
      <Select 
      label="Ticket Selection List" 
      options={tickets} 
      value={fullOrder.ticket || parsedOrder?.ticket}
      onChange={(value) => {
        setFullOrder(prev => ({...prev, ticket: value}))
      }}
      />
      <Select 
      label="Select Supplier" 
      options={supplierOptions} 
      value={fullOrder.supplier || parsedOrder?.supplier}
      onChange={(value) => {
        setFullOrder(prev => ({...prev, supplier: value}))
      }}
      />
      <Select 
      label="Select Template" 
      options={templateOptions} 
      value={fullOrder.template || parsedOrder?.template}
      onChange={(value) => {
        setFullOrder(prev => 
          ({...prev, template: value, 
            templateItems: templateOptions.find(template => template.value === value).items})
        )
      }}
      />
    </>
  );
};

export default PickSetup;
