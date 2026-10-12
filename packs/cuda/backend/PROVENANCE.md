# Worker syscall profiles

These JSON profiles derive from Moby's Apache-2.0 default seccomp profile at
commit `f9bc03ec19b2dc4c091449b08e88f85c0caa9f0b`,
<https://github.com/moby/profiles/blob/f9bc03ec19b2dc4c091449b08e88f85c0caa9f0b/seccomp/default.json>.
The included MOBY-LICENSE preserves its license.

The compiler profile adds one unprivileged `unshare(CLONE_NEWUSER | CLONE_NEWPID)`
rule required by the isolated candidate namespace launcher. The evaluator uses
its existing native worker launcher and has no such exception. These exact
profile bytes match the previously qualified worker recipe hashes in
`../locks/upstream.json`. No private worker source is redistributed here.
