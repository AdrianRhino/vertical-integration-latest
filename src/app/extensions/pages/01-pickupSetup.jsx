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

  // Validate whenever fullOrder or parsedOrder changes
  useEffect(() => {
    const ticket = fullOrder.ticket || parsedOrder?.ticket;
    const supplier = fullOrder.supplier || parsedOrder?.supplier;
    const template = fullOrder.template || parsedOrder?.template;
    
    console.log("PickSetup validation check:", { 
      ticket, 
      supplier, 
      template, 
      fullOrderTicket: fullOrder.ticket,
      fullOrderSupplier: fullOrder.supplier,
      fullOrderTemplate: fullOrder.template,
      parsedOrderTicket: parsedOrder?.ticket,
      parsedOrderSupplier: parsedOrder?.supplier,
      parsedOrderTemplate: parsedOrder?.template
    });
    
    // Check if values exist (handle strings, numbers, and truthy values)
    const hasTicket = ticket !== undefined && ticket !== null && ticket !== "";
    const hasSupplier = supplier !== undefined && supplier !== null && supplier !== "";
    const hasTemplate = template !== undefined && template !== null && template !== "";
    
    const isValid = hasTicket && hasSupplier && hasTemplate;
    console.log("PickSetup validation result:", { hasTicket, hasSupplier, hasTemplate, isValid });
    
    setNextButtonDisabled(!isValid);
  }, [
    fullOrder.ticket, 
    fullOrder.supplier, 
    fullOrder.template,
    fullOrder,
    parsedOrder,
    setNextButtonDisabled
  ]);

  const validateAndSetDisabled = (ticket, supplier, template) => {
    const hasTicket = ticket !== undefined && ticket !== null && ticket !== "";
    const hasSupplier = supplier !== undefined && supplier !== null && supplier !== "";
    const hasTemplate = template !== undefined && template !== null && template !== "";
    const isValid = hasTicket && hasSupplier && hasTemplate;
    setNextButtonDisabled(!isValid);
  };

  return (
    <>
      <Select 
      label="Ticket Selection List" 
      options={tickets} 
      value={fullOrder.ticket || parsedOrder?.ticket}
      onChange={(value) => {
        const updatedOrder = {...fullOrder, ticket: value};
        setFullOrder(updatedOrder);
        validateAndSetDisabled(
          value || parsedOrder?.ticket,
          updatedOrder.supplier || parsedOrder?.supplier,
          updatedOrder.template || parsedOrder?.template
        );
      }}
      />
      <Select 
      label="Select Supplier" 
      options={supplierOptions} 
      value={fullOrder.supplier || parsedOrder?.supplier}
      onChange={(value) => {
        const updatedOrder = {...fullOrder, supplier: value};
        setFullOrder(updatedOrder);
        validateAndSetDisabled(
          updatedOrder.ticket || parsedOrder?.ticket,
          value || parsedOrder?.supplier,
          updatedOrder.template || parsedOrder?.template
        );
      }}
      />
      <Select 
      label="Select Template" 
      options={templateOptions} 
      value={fullOrder.template || parsedOrder?.template}
      onChange={(value) => {
        const updatedOrder = {
          ...fullOrder, 
          template: value, 
          templateItems: templateOptions.find(template => template.value === value)?.items
        };
        setFullOrder(updatedOrder);
        validateAndSetDisabled(
          updatedOrder.ticket || parsedOrder?.ticket,
          updatedOrder.supplier || parsedOrder?.supplier,
          value || parsedOrder?.template
        );
      }}
      />
    </>
  );
};

export default PickSetup;
