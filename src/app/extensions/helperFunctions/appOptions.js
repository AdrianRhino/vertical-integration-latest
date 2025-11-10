export const appOptions = [
    { label: "New Order", value: "New Order" },
    { label: "Draft Order", value: "Draft Order" },
    { label: "Submitted Order", value: "Submitted Order" },
  ];
  
  export const supplierOptions = [
    { label: "ABC", value: "abc" },
    { label: "Beacon", value: "beacon" },
    { label: "SRS", value: "srs" },
  ];
  
  export const templateOptions = [
    { label: "Template 1", value: "template1", items: [] },
    { label: "Template 2", value: "template2", 
      items: [
          {
            sku: "02OC025AEG - A",
            title: "Owens Corning Oakridge AR - Estate Grey",
            qty: 10,
            uom: "SQ",
            variant: "-",
            basePrice: 12.5,
            unitPrice: 12.5,
            linePrice: 0.0,
            uoms: ["SQ", "BNDL"],
          },
          {
            sku: "ST-OC-EST - A",
            title: "Owens Corning Starter Strip",
            qty: 10,
            uom: "EA",
            variant: "-",
            unitPrice: 18.25,
            basePrice: 18.25,
            linePrice: 0.0,
            uoms: ["EA"],
          },
          {
            sku: "RC-OC-EST - A",
            title: "Owens Corning Ridge Cap",
            qty: 10,
            uom: "EA",
            variant: "-",
            unitPrice: 9.75,
            basePrice: 9.75,
            linePrice: 0.0,
            uoms: ["EA"],
          },
          {
            sku: "UL-GFT-100 - A",
            title: "Synthetic Underlayment – 10-SQ roll",
            qty: 5,
            uom: "RL",
            variant: "-",
            unitPrice: 20.0,
            basePrice: 20.0,
            linePrice: 0.0,
            uoms: ["RL"],
          },
          {
            sku: "IW-36-75 - A",
            title: 'Ice & Water Shield 36" × 75′',
            qty: 3,
            uom: "RL",
            variant: "-",
            unitPrice: 23.5,
            basePrice: 23.5,
            linePrice: 0.0,
            uoms: ["RL"],
          },
        ],
     },
    
  ];