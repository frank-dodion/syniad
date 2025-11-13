// Minimal WebSocket connect handler for testing
// This does NO validation, NO DynamoDB calls - just returns 200
// If this works, the issue is in our logic. If it doesn't, it's API Gateway config.

exports.handler = async (event) => {
  console.log('Minimal WebSocket Connect - Event received');
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Return the simplest possible success response
  const response = {
    statusCode: 200
  };
  
  console.log('Returning response:', JSON.stringify(response));
  return response;
};

