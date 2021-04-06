const W3CWebSocket = require("websocket").w3cwebsocket;

exports.subscribe = ({collection, folders, callback, endpoint}) => {
    if (!Array.isArray(folders)) folders = [folders];
    if (!endpoint) endpoint = "wss://qv1wvebvyc.execute-api.us-east-1.amazonaws.com/production";
    const client = new W3CWebSocket(endpoint);

    client.onopen = () => {
        //console.log(`Websocket client connected`);
        client.send(JSON.stringify({action:"subscribe",data:{collection,ids:folders}}));
        //console.log(`Websocket client requested subscription`);
    };

    client.onmessage = (message) => {
        //console.log(`Websocket received ${message.data}`);
        if (callback) callback(JSON.parse(message.data));
    };

    client.onerror = (error) => {
        console.log(`Subscription websocket error: ${JSON.stringify(error)}`);
    };
};