class Session:
    def __init__(self, phone_number):
        self.phone_number = phone_number
        self.conversation_history = [{"role": "system", "content": "You are a helpful assistant."}]
        self.sector_confirmed = False
        self.sector = "general"

    def update_sector(self, sector, prompts):
        self.sector = sector
        self.sector_confirmed = True
        sys_prompt = prompts.get(sector, prompts.get("general", "You are a helpful assistant."))
        if self.conversation_history and self.conversation_history[0]["role"] == "system":
            self.conversation_history[0]["content"] = sys_prompt
        else:
            self.conversation_history.insert(0, {"role": "system", "content": sys_prompt})

class SessionStore:
    def __init__(self):
        self.sessions = {}

    def get_or_create(self, phone_number):
        if phone_number not in self.sessions:
            self.sessions[phone_number] = Session(phone_number)
        return self.sessions[phone_number]
