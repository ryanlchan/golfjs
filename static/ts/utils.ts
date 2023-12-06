import { get, set } from "./cache";

/**
 * Utility to have a wait promise
 * @param ms - The number of milliseconds to wait
 * @returns Promise that resolves after a delay
 */
export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * Shows an error message based on the geolocation error code.
 * @param {Error} error - The geolocation error object.
 */
export function showError(error: Error | string, timeout = 5000): void {
    const el = document.getElementById("error");
    el.classList.remove("inactive");
    el.innerText = error instanceof Error ? error.message : error;
    const close = document.createElement("a");
    close.href = "#";
    close.innerText = " X "
    close.addEventListener('click', () => el.classList.add("inactive"));
    el.appendChild(close);
    if (timeout > 0) {
        setTimeout(() => el.classList.add("inactive"), timeout)
    }
}


/**
 * Hide an error
 */
export function hideError(): void {
    const el = document.getElementById("error");
    el.innerText = "";
    el.classList.add("inactive");
}

export function touch(...objs: HasUpdateDates[]): HasUpdateDates[] {
    for (let obj of objs) {
        obj.updatedAt = new Date().toISOString();
    }
    return objs;
}

export function setter(obj: HasUpdateDates, key: string, val: any): HasUpdateDates {
    obj[key] = val;
    touch(obj);
    return obj;
}

/**
 * **************** 
 * * LocalStorage *
 * **************** 
 */

function getJSON(key: string) {
    try {
        return JSON.parse(localStorage.getItem(key));
    } catch (e) {
        return;
    }
}

function setJSON(key: string, value: any) {
    return localStorage.setItem(key, JSON.stringify(value));
}

export function getSetting(setting: string): any {
    const settings = getJSON('settings');
    if (!settings) return;
    return settings[setting];
}

export function setSetting(setting: string, value: any): void {
    let settings = getJSON('settings') || {};
    settings[setting] = value;
    setJSON('settings', settings);
}

export function getUnitsSetting(): string {
    return getSetting('unit') || "yards";
}
