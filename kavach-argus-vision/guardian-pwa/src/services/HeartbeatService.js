export class HeartbeatService {
  constructor() {
    this.intervalId = null;
  }

  start() {
    if (this.intervalId) return;
    this.sendHeartbeat();
    this.intervalId = setInterval(() => this.sendHeartbeat(), 30000);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async sendHeartbeat() {
    try {
      let lat = 13.0827, lon = 77.5877; // default
      try {
        const pos = await new Promise((res, rej) => 
          navigator.geolocation.getCurrentPosition(res, rej, {timeout: 3000})
        );
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch(e) {}

      const reg = JSON.parse(localStorage.getItem("kavach_reg") || "{}");
      const body = {
        lat, lon,
        timestamp: new Date().toISOString(),
        victim_name: reg.name || import.meta.env.VITE_VICTIM_NAME || "Demo User"
      };

      await fetch(`http://${import.meta.env.VITE_MSI_IP || "localhost"}:8000/api/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      console.log("Heartbeat sent", body);
    } catch(e) {
      console.log("Heartbeat failed", e);
    }
  }
}
