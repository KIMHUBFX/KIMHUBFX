  let ws;
let token = localStorage.getItem("deriv_token");
let running = false;

// CONNECT TO DERIV
function connect() {
    ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

    ws.onopen = () => {
        ws.send(JSON.stringify({ authorize: token }));
    };

    ws.onmessage = (msg) => {
        let data = JSON.parse(msg.data);

        if (data.authorize) {
            loadBalance();
            subscribeTicks();
        }

        if (data.balance) {
            document.getElementById("balance").innerHTML = data.balance.balance;
        }

        if (data.tick) {
            let price = data.tick.quote.toString();
            let lastDigit = price.slice(-1);

            document.getElementById("tick").innerHTML = price;

            document.getElementById("digit").innerHTML = lastDigit;
            document.getElementById("digit").style.color = "#0f0";

            if (running) runTrade(lastDigit);
        }
    };
}

// LOAD BALANCE
function loadBalance() {
    ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
}

// SUBSCRIBE TO TICKS
function subscribeTicks() {
    ws.send(JSON.stringify({
        ticks: "R_100",
        subscribe: 1
    }));
}

// TRADING LOGIC (ODD)
function runTrade(lastDigit) {

    let isOdd = lastDigit % 2 !== 0;

    let result = isOdd ? "WIN (Odd)" : "LOSS (Even)";
    let color = isOdd ? "lightgreen" : "red";

    let log = document.createElement("p");
    log.style.color = color;
    log.innerHTML = `Digit: ${lastDigit} → ${result}`;

    document.getElementById("history").prepend(log);
}

// BUTTONS
document.getElementById("startBtn").onclick = () => {
    running = true;
};

document.getElementById("stopBtn").onclick = () => {
    running = false;
};

// START SYSTEM
connect();
