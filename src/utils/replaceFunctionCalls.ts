// This is a utility to help replace old function calls with new ones
// Run this script to update all function references

export const functionMappings = {
  'log_enhanced_security_event': 'log_security_event',
  'anonymize_old_location_data': 'anonymize_location_data',
  'trigger_security_incident': 'log_security_event'
};

export function replaceFunctionCall(oldCall: string, functionName: string): string {
  const newFunction = functionMappings[functionName as keyof typeof functionMappings];
  if (!newFunction) return oldCall;
  
  return oldCall.replace(functionName, newFunction);
}