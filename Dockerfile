FROM node:current-alpine

# Create app directory
WORKDIR /usr/src/app

COPY package.json ./

RUN npm install

# Bundle app source
COPY *.js ./
COPY mymelcloud/*.js ./mymelcloud/

USER node:node

CMD [ "node", "melcloud2mqtt.js" ]
