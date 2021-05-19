import { AppWindow } from "../AppWindow";
import {
  OWGamesEvents,
  OWHotkeys
} from "@overwolf/overwolf-api-ts";
import { interestingFeatures, hotkeys, windowNames, hearthstoneClassId } from "../consts";
import WindowState = overwolf.windows.WindowStateEx;

var decks = [];

// The window displayed in-game while a hearthstone game is running.
// It listens to all info events and to the game events listed in the consts.ts file
// and writes them to the relevant log using <pre> tags.
// Like the background window, it also implements the Singleton design pattern.

class InGame extends AppWindow {
  private static _instance: InGame;
  private _hearthstoneGameEventsListener: OWGamesEvents;
  private _eventsLog: HTMLElement;
  private _infoLog: HTMLElement;
  private _consoleLog: HTMLElement;
  private _consoleForm: HTMLElement;
  private _deck_tracker: HTMLElement;
  private CONSOLE_COMMANDS = ["add", "clear"]
  private CONSOLE_ARGS = ["card", "deck"]

  private constructor() {
    super(windowNames.inGame);

    this._eventsLog = document.getElementById('eventsLog');
    this._infoLog = document.getElementById('infoLog');
    this._consoleLog = document.getElementById('consoleLog');
    this._consoleForm = document.getElementById("consoleForm");
    this._deck_tracker = document.getElementById("deck_tracker_container");

    this.setToggleHotkeyBehavior();
    this.setToggleHotkeyText();

    this._hearthstoneGameEventsListener = new OWGamesEvents({
      onInfoUpdates: this.onInfoUpdates.bind(this),
      onNewEvents: this.onNewEvents.bind(this)
    },
      interestingFeatures);

    this._consoleForm.onsubmit = () => {
      const line_div = document.createElement("div");

      const line = document.createElement('pre');
      const arrows = document.createElement("span");
      arrows.classList.add("first");
      arrows.innerText = ">>>";
      arrows.style.color = "aqua";

      let input = (document.getElementById("consoleFormInput") as HTMLInputElement).value.split(" ");
      let output = "<span>";
      for (let arg of input) {
        // Check if arg is in commands and is the first argument of input
        if (this.CONSOLE_COMMANDS.includes(arg) && input[0] == arg) {
          output += "<span class='yellow'>" + arg + "</span>";
        } else if (this.CONSOLE_ARGS.includes(arg) && input[0] != arg) {
          output += "<span class='green'>" + arg + "</span>";
        } else {
          output += arg;
        }
        output += " ";
      }
      output += "</span>";

      line.innerHTML = output;
      line_div.appendChild(arrows);
      line_div.appendChild(line)

      const shouldAutoScroll = (this._consoleLog.scrollTop + this._consoleLog.offsetHeight) > (this._consoleLog.scrollHeight - 10);

      // Add the line to the console
      this._consoleLog.appendChild(line_div);

      // Execute the command if it exists
      this.console_execute(input);

      if (shouldAutoScroll) {
        this._consoleLog.scrollTop = this._consoleLog.scrollHeight;
      }

      // Clear the current input line and prevent reload
      (document.getElementById("consoleFormInput") as HTMLInputElement).value = "";
      return false;
    };

  }

  private console_execute(input) {
    // Update the reference to deck tracker
    this._deck_tracker = document.getElementById("deck_tracker_container");

    let command = input[0];
    let args = input.slice(1, input.length);

    // 'add' commands
    if (command == "add") {
      if (args.length < 3) {
        this.console_log("Missing required arguments");
        return false;
      }

      // 'card' commands
      if (args[0] == "card") {
        this.console_log("Added card '" + args[1] + "' to deck tracker.");
        this.addCard({"name": args[1], "cost": args[2], "count": 1});
      }
    } else if (command == "clear") {
      if (args.length < 1) {
        this.console_log("Missing required arguments");
        return false
      }

      if (args[0] == "deck") {
        this.console_log("Cleared deck tracker.");
        this.clearDeck();
      }

    } else {
      // No commands found
      let i = 0;
      let min_index = 0;
      let cur_min_distance = Number.MAX_SAFE_INTEGER;
      for (let c_commands of this.CONSOLE_COMMANDS) {
        let distance = this.string_distance(command, c_commands)
        if (distance < cur_min_distance) {
          min_index = i;
          cur_min_distance = distance;
        }
        i += 1;
      }
      this.console_log("<span>Unknown command. Did you mean</span> <span class='yellow'>" + this.CONSOLE_COMMANDS[min_index] + "</span>?");
    }
  }

  private console_log(message, color="") {
    const line_div = document.createElement("div");
    line_div.innerHTML = message;
    if (color != "") line_div.classList.add(color);
    this._consoleLog.appendChild(line_div)
  }

  public static instance() {
    if (!this._instance) {
      this._instance = new InGame();
    }

    return this._instance;
  }

  public run() {
    this._hearthstoneGameEventsListener.start();
  }

  // Log new info to the info log
  private onInfoUpdates(info) {
    // this.logLine(this._infoLog, info, false);
    this.manageInfoState(info);
  }

  // Special events will be highlighted in the event log
  private onNewEvents(e) {
    // Update the deck tracker reference on info update
    this._deck_tracker = document.getElementById("deck_tracker_container");

    this.logLine(this._eventsLog, e, false);
    this.manageEventState(e);
  }

  // Displays the toggle minimize/restore hotkey in the window header
  private async setToggleHotkeyText() {
    const hotkeyText = await OWHotkeys.getHotkeyText(hotkeys.toggle, hearthstoneClassId);
    const hotkeyElem = document.getElementById('hotkey');
    hotkeyElem.textContent = hotkeyText;
  }

  // Sets toggleInGameWindow as the behavior for the Ctrl+F hotkey
  private async setToggleHotkeyBehavior() {
    const toggleInGameWindow = async (hotkeyResult: overwolf.settings.hotkeys.OnPressedEvent): Promise<void> => {
      console.log(`pressed hotkey for ${hotkeyResult.name}`);
      const inGameState = await this.getWindowState();

      if (inGameState.window_state === WindowState.NORMAL ||
        inGameState.window_state === WindowState.MAXIMIZED) {
        this.currWindow.minimize();
      } else if (inGameState.window_state === WindowState.MINIMIZED ||
        inGameState.window_state === WindowState.CLOSED) {
        this.currWindow.restore();
      }
    }

    OWHotkeys.onHotkeyDown(hotkeys.toggle, toggleInGameWindow);
  }

  private updateDecks(data) {
    decks = [];
    this.logLine(this._infoLog, data, false);
    for (let [key, value] of Object.entries(data)) {
      let name = JSON.stringify(key);
      let cards = [];
      this.console_log("Adding deck " + name);
      for (let [k, v] of Object.entries(JSON.parse("" + value)["cards"])) {
        let id, name, count, cost, url;
        id = JSON.parse("" + JSON.stringify(v))["id"]
        this.console_log("id: " + id);
        this.getCardById(id, (response) => {
          response.text().then((text) => {
            name = JSON.parse(text)[0]["name"];
            count = parseInt(JSON.parse("" + JSON.stringify(v))["count"])
            cost = JSON.parse(text)[0]["cost"];
            url = JSON.parse(text)[0]["img"];
            cards.push({"name": name, "count": count, "cost": cost, "url": url})
          });
        });
      }
      decks.push({"name": name, "cards": cards})
    }
  }

  private getCardById(id, callback) {
    fetch("https://omgvamp-hearthstone-v1.p.rapidapi.com/cards/" + id, {
	    "method": "GET",
	    "headers": {
		    "x-rapidapi-key": "af57618811msh87681078a3caecdp1cc580jsn6be77ad229cf",
		    "x-rapidapi-host": "omgvamp-hearthstone-v1.p.rapidapi.com"
	    }
    })
    .then(response => {
	    callback(response);
    })
    .catch(err => {
	    this.console_log(err);
    });
  }

  private manageInfoState(info) {
    if ('decks' in info) {
      this.updateDecks(info.decks);
    }
  }

  private manageEventState(data) {
    if (data["events"][0]["name"] == "match_start") {

      this.generateDeck(decks[0]);

      this.console_log("MATCH STARTED", "red");
    }
  }

  // Appends a new line to the specified log
  private logLine(log: HTMLElement, data, highlight) {
    const line = document.createElement('pre');
    line.textContent = JSON.stringify(data);

    if (highlight) {
      line.className = 'highlight';
    }

    const shouldAutoScroll = (log.scrollTop + log.offsetHeight) > (log.scrollHeight - 10);

    log.appendChild(line);

    if (shouldAutoScroll) {
      log.scrollTop = log.scrollHeight;
    }
  }

  // Functions that interact with the deck tracker
  // Card must be in the format:
  // {"name": "example", "count": 2, "url": "test...", "cost": 3}
  private addCard(card) {
    this._deck_tracker = document.getElementById("deck_tracker_container")
    let quantity = card["count"];
    let card_dom = document.createElement("div");
    card_dom.classList.add("card");
    card_dom.innerHTML =
      "          <div class=\"card-info\">" + card["cost"] + "</div>\n" +
      "          <div class=\"card-body\">" + card["name"] + "</div>\n" +
      "          <div class=\"card-quantity\">" + quantity + "</div>\n" +
      "          <div class=\"card_preview\">\n" +
      "            <img src=\"" + card["url"] + "\" alt=\"" + card["name"] + "\">\n" +
      "          </div>\n";


    // If the deck has no cards in it
    if (this._deck_tracker.children.length == 0) {
      this._deck_tracker.appendChild(card_dom);
      return;
    }

    // Insert the card in the proper position
    let i = 0;
    for (let other_card of this._deck_tracker.children) {
      // If the two cards have the same name, increase the quantity of other_card by 'quantity'
      if (card["name"] == (other_card.children[1] as HTMLElement).innerText) {
        (other_card.children[2] as HTMLElement).innerText = parseInt((other_card.children[2] as HTMLElement).innerText) + quantity;
        return;
      } else {
        if (card["cost"] < parseInt((other_card.children[0] as HTMLElement).innerText)) {
          // Insert card at the correct position
          this._deck_tracker.insertBefore(card_dom, other_card);
          return;
        } else if (i == this._deck_tracker.children.length - 1) {
          this._deck_tracker.appendChild(card_dom);
          return;
        }
      }
      i += 1;
    }

    // If the card hasn't found a correct position, insert it at the end.
    this._deck_tracker.appendChild(card_dom);
  }

  // Create the deck based upon a list of cards
  private generateDeck(deck) {
      this.clearDeck()
      for (let card of deck["cards"]) {
        this.addCard(card)
      }
  }

  private clearDeck() {
    while (this._deck_tracker.firstChild) {
      this._deck_tracker.removeChild(this._deck_tracker.firstChild);
    }
  }

  private string_distance (s, t) {
    if (!s.length) return t.length;
    if (!t.length) return s.length;

    return Math.min(
        this.string_distance(s.substr(1), t) + 1,
        this.string_distance(t.substr(1), s) + 1,
        this.string_distance(s.substr(1), t.substr(1)) + (s[0] !== t[0] ? 1 : 0)
    ) + 1;
  }


}

InGame.instance().run();
