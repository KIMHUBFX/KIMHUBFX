// Check token
function getToken() {
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
}

const token = getToken();

if (!token) {
    document.getElementById("balance").innerText = "No token — please login";
    throw new Error("No token");
}

const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=112604");

ws.onopen = () => {
    ws.send(JSON.stringify({ authorize: token }));
    ws.send(JSON.stringify({ balance: 1 }));
    ws.send(JSON.stringify({ ticks: "R_100" }));
};

ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);

    if (data.balance) {
        document.getElementById("balance").innerText =
            data.balance.balance + " USD";
    }

    if (data.tick) {
        document.getElementById("tick").innerText = data.tick.quote;
    }
};