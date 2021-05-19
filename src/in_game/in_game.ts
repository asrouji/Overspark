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
// The window also sets up Ctrl+F as the minimize/restore hotkey.
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
  private CONSOLE_ARGS = ["card"]

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
      arrows.innerText = ">>>";
      arrows.style.color = "aqua";

      let input = (document.getElementById("consoleFormInput") as HTMLInputElement).value.split(" ");
      let output = "<span>";
      for (let arg of input) {
        // Check if arg is in commands and is the first argument of input
        if (this.CONSOLE_COMMANDS.includes(arg) && input[0] == arg) {
          output += "<span class='yellow'>" + arg + "</span>";
        } else if (this.CONSOLE_ARGS.includes(arg)) {
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
      if (this.CONSOLE_COMMANDS.includes(input[0])) {
        this.console_execute(input);
      }

      if (shouldAutoScroll) {
        this._consoleLog.scrollTop = this._consoleLog.scrollHeight;
      }

      // Clear the current input line and prevent reload
      (document.getElementById("consoleFormInput") as HTMLInputElement).value = "";
      return false;
    };

  }

  private console_execute(input) {
    let command = input[0];
    let args = input.slice(1, input.length);

    // 'add' commands
    if (command == "add") {

      if (args.length < 3) {
        this.console_log("Missing required arguments")
        return false
      }

      // 'card' commands
      if (args[0] == "card") {
        this.console_log("Added card '" + args[1] + "' to deck tracker.")
        this.addCard({"name": args[1], "cost": args[2]}, 1)
      }
    }
  }

  private console_log(message) {
    const line_div = document.createElement("div");
    line_div.innerHTML = message;
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
    this.logLine(this._infoLog, data, false);
    let deckCount = 0;
    for (let [key, value] of Object.entries(data)) {
      deckCount++;
      // this.console_log(JSON.stringify(JSON.parse("" + value).cards));
      for (let [k, v] of Object.entries(JSON.parse("" + value).cards)) {

      }
    }
    this.logLine(this._infoLog, deckCount, true);
  }

  private manageInfoState(info) {
    if ('decks' in info) {
      this.updateDecks(info.decks);
    }
  }

  private manageEventState(data) {
    if (data["events"][0]["name"] == "match_start") {
      let p_el = document.createElement("p")
      p_el.innerText = "MATCH STARTED"
      this._infoLog.appendChild(p_el);
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
  // {"name": "example", "cost": 3, etc...}
  private addCard(card, quantity) {
    this._deck_tracker = document.getElementById("deck_tracker_container")
    let card_dom = document.createElement("div");
    card_dom.classList.add("card");
    card_dom.innerHTML =
      "          <div class=\"card-info\">" + card["cost"] + "</div>\n" +
      "          <div class=\"card-body\">" + card["name"] + "</div>\n" +
      "          <div class=\"card-quantity\">" + quantity + "</div>\n";

    let i = 0
    for (let other_card of this._deck_tracker.children) {
      if (card["cost"] < parseInt((other_card.children[0] as HTMLElement).innerText)) {
        // Insert card at the correct position
        this._deck_tracker.insertBefore(card_dom, this._deck_tracker.children[i-1])
      } else if (i == this._deck_tracker.children.length - 1) {
        // this._deck_tracker.appendChild(card_dom)
        this._deck_tracker.appendChild(card_dom);
      }
      i += 1;
    }
  }

}

InGame.instance().run();
