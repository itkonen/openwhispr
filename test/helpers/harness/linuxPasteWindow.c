/* Run only on the private Xvfb display created by linuxFastPaste.test.js.
 * Captures real XTest key events from the compiled production helper. */
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/keysym.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

int main(int argc, char **argv) {
    if (argc != 6 || !getenv("OPENWHISPR_TEST_DISPLAY")) return 2;
    Display *dpy = XOpenDisplay(getenv("OPENWHISPR_TEST_DISPLAY"));
    if (!dpy) return 3;
    Window root = DefaultRootWindow(dpy);
    Window parent = XCreateSimpleWindow(dpy, root, 0, 0, 100, 100, 0, 0, 0);
    XClassHint hint = { .res_name = argv[2], .res_class = argv[3] };
    if (strcmp(argv[3], "NONE") != 0) XSetClassHint(dpy, parent, &hint);
    XMapWindow(dpy, parent);
    Window win = parent;
    if (strcmp(argv[4], "child") == 0) {
        win = XCreateSimpleWindow(dpy, parent, 0, 0, 50, 50, 0, 0, 0);
        XMapWindow(dpy, win);
    }
    XSelectInput(dpy, win, KeyPressMask | KeyReleaseMask);
    XSetInputFocus(dpy, win, RevertToParent, CurrentTime);
    XSync(dpy, False);
    pid_t pid = fork();
    if (pid == 0) {
        setenv("DISPLAY", getenv("OPENWHISPR_TEST_DISPLAY"), 1);
        if (strcmp(argv[5], "auto") == 0) execl(argv[1], argv[1], NULL);
        else execl(argv[1], argv[1], argv[5], NULL);
        _exit(127);
    }
    int status;
    if (pid < 0 || waitpid(pid, &status, 0) < 0 || !WIFEXITED(status) || WEXITSTATUS(status)) return 4;
    XSync(dpy, False);
    while (XPending(dpy)) {
        XEvent event;
        XNextEvent(dpy, &event);
        if (event.type == KeyPress || event.type == KeyRelease) {
            KeySym sym = XLookupKeysym(&event.xkey, 0);
            printf("%s:%s\n", event.type == KeyPress ? "down" : "up", XKeysymToString(sym));
        }
    }
    XDestroyWindow(dpy, parent);
    XCloseDisplay(dpy);
    return 0;
}
