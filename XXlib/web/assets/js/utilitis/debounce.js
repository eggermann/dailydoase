export default function debounce(func, timeInMs = 20) {
    let timerId = null;

    return () => {
        if (timerId) {
            return;
        }

        timerId = window.setTimeout(() => {
            func();
            timerId = null;
        }, timeInMs)
    };
}
