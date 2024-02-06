# Use the official Node.js image as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm update  

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port on which your application will run
EXPOSE $PORT

# Command to run your application
CMD ["npm", "start"]
