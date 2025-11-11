import { Text, Input, Select, TextArea, Heading, DateInput } from "@hubspot/ui-extensions";
import { convertToDateInputFormat } from "./normalizeValue";


export const renderField = (
    field,
    dropdownOptions,
    ownerOptions,
    formData,
    setFormData,
    contactValues
  ) => {
    const value =
      formData?.[field.internalName] !== undefined
        ? formData[field.internalName]
        : contactValues?.[field.internalName] || "";
  
    switch (field.type) {
      case "dropdown":
        return (
          <>
            <Text></Text>
            {field?.script != "" ? (
              <Heading>{field?.script}</Heading>
            ) : (
              <Text variant="microcopy">{field?.label}</Text>
            )}
            <Text></Text>
            <Select
              key={field?.internalName}
              placeholder={`Select...`}
              options={field?.options}
              value={value}
              onChange={(val) =>
                setFormData(field?.internalName, val)
              }
            />
            <Text></Text>
          </>
        );
      case "hubspot user":
        return (
          <>
            <Text></Text>
            {field?.script != "" ? (
              <Heading>{field?.script}</Heading>
            ) : (
              <Text variant="microcopy">{field?.label}</Text>
            )}
            <Text></Text>
            <Select
              key={field?.internalName}
              placeholder={`Enter ${field?.placeholder}`}
              options={ownerOptions || []}
              value={value}
              onChange={(val) =>
                setFormData(field?.internalName, val)
              }
            />
            <Text></Text>
          </>
        );
      case "multiline":
        return (
          <>
            <Text></Text>
            {field?.script != "" ? (
              <Heading>{field?.script}</Heading>
            ) : (
              <Text variant="microcopy">{field?.label}</Text>
            )}
            <Text></Text>
            <TextArea
              key={field?.internalName}
              placeholder={`Enter ${field?.placeholder}`}
              value={value}
              onChange={(val) =>
                setFormData(field?.internalName, val)
              }
            />
            <Text></Text>
          </>
        );
      case "scriptOnly":
        return <Heading key={field?.internalName}>{field?.script}</Heading>;
      case "input":
        return (
          <>
          <Text variant="microcopy">{field?.label || field?.placeholder}</Text>
          <Input
            key={field?.internalName}
            placeholder={`Enter ${field?.placeholder}`}
            value={value}
            onChange={(val) =>
              setFormData(field?.internalName, val)
            }
          />
          <Text></Text>
          </>
          
        )
      case "dateInput":
        // DateInput expects { year, month, date } object or undefined
        // Handle different value formats: string, DateInput object, or empty/null
        let dateValue = undefined;
        
        // Skip empty strings and null/undefined
        if (value && value !== "" && value !== null && value !== undefined) {
          // If already a DateInput object (has year, month, date), use it directly
          if (typeof value === "object" && "year" in value && "month" in value && "date" in value) {
            // Validate the date object has valid values
            if (typeof value.year === "number" && typeof value.month === "number" && typeof value.date === "number") {
              dateValue = {
                year: value.year,
                month: value.month, // 0-based (0 = January)
                date: value.date
              };
            }
          } 
          // If it has formattedDate (from DateInput onChange), extract the date parts
          else if (typeof value === "object" && "formattedDate" in value && value.formattedDate) {
            dateValue = convertToDateInputFormat(value.formattedDate);
          }
          // If it's a string, convert it
          else if (typeof value === "string" && value.trim() !== "") {
            dateValue = convertToDateInputFormat(value.trim());
          }
        }
        
        // Debug logging (remove after fixing)
        if (field?.internalName === "delivery_date") {
          console.log("DateInput value for delivery_date:", {
            rawValue: value,
            convertedValue: dateValue,
            valueType: typeof value
          });
        }
        
        return (
          <>
            <DateInput
              name={field?.internalName}
              label={field?.label || field?.placeholder}
              value={dateValue}
              onChange={(val) => {
                console.log("DateInput onChange:", field?.internalName, val);
                setFormData(field?.internalName, val);
              }}
            />
            <Text></Text>
          </>
        );
      default:
        return (
          <>
            <Text></Text>
            {field?.script != "" ? (
              <Heading>{field?.script}</Heading>
            ) : (
              <Text variant="microcopy">{field?.label}</Text>
            )}
            <Text></Text>
            <Input
              key={field?.internalName}
              placeholder={`Enter ${field?.placeholder}`}
              value={value}
              onChange={(val) =>
                setFormData(field?.internalName, val)
              }
            />
            <Text></Text>
            <Text></Text>
          </>
        );
    }
  };
  