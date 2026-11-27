#define _GNU_SOURCE
#include <node_api.h>
#include <dlfcn.h>
#include <errno.h>
#include <linux/prctl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <stdint.h>
#include <sys/prctl.h>
#include <sys/resource.h>

typedef void *filter_context;
typedef struct {
  unsigned int arg;
  int op;
  uint64_t datum_a;
  uint64_t datum_b;
} argument_comparison;

static int applied = 0;
static napi_value fail(napi_env env);

static napi_value probe(napi_env env, napi_callback_info info) {
  (void)info;
  if (!applied) return fail(env);
  errno = 0;
  int network = syscall(SYS_socket, AF_INET, SOCK_STREAM, 0);
  if (network >= 0 || errno != EPERM) _exit(125);
  errno = 0;
  long process = syscall(SYS_clone, 0, NULL, NULL, NULL, 0);
  if (process >= 0 || errno != EPERM) _exit(125);
  errno = 0;
  void *code = mmap(NULL, 4096, PROT_READ | PROT_EXEC, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
  if (code != MAP_FAILED || errno != EPERM) _exit(125);
  napi_value result;
  napi_get_boolean(env, 1, &result);
  return result;
}

static napi_value fail(napi_env env) {
  napi_throw_error(env, NULL, "coding_node_sandbox_unavailable");
  return NULL;
}

static napi_value confine(napi_env env, napi_callback_info info) {
  (void)info;
  if (applied) return fail(env);
  void *library = dlopen("libseccomp.so.2", RTLD_NOW | RTLD_LOCAL);
  if (!library) return fail(env);
  filter_context (*initialize)(uint32_t) = dlsym(library, "seccomp_init");
  int (*rule)(filter_context, uint32_t, int, unsigned int, const argument_comparison *) =
    dlsym(library, "seccomp_rule_add_array");
  int (*resolve)(const char *) = dlsym(library, "seccomp_syscall_resolve_name");
  int (*attribute)(filter_context, int, uint32_t) = dlsym(library, "seccomp_attr_set");
  int (*load)(filter_context) = dlsym(library, "seccomp_load");
  void (*release)(filter_context) = dlsym(library, "seccomp_release");
  if (!initialize || !rule || !resolve || !attribute || !load || !release)
    return fail(env);
  filter_context context = initialize(0x7fff0000);
  if (!context) return fail(env);
  /* Synchronize existing Node/V8/libuv threads before importing selected files. */
  if (attribute(context, 4, 1) != 0) {
    release(context);
    return fail(env);
  }
  const char *denied[] = {
    "socket", "socketpair", "connect", "bind", "listen", "accept", "accept4",
    "sendto", "sendmsg", "sendmmsg", "recvmsg", "recvmmsg", "io_uring_setup",
    "clone", "clone3", "fork", "vfork", "execve", "execveat",
    "ptrace", "process_vm_readv", "process_vm_writev", "pidfd_getfd",
    "kill", "tkill", "tgkill", "rt_sigqueueinfo", "rt_tgsigqueueinfo",
    "pidfd_send_signal", "process_madvise",
    "chmod", "fchmod", "fchmodat", "fchmodat2", "chown", "lchown",
    "fchown", "fchownat", "setxattr", "lsetxattr", "fsetxattr",
    "removexattr", "lremovexattr", "fremovexattr",
    "utime", "utimes", "futimesat", "utimensat",
    "mount", "umount2", "pivot_root", "chroot", "setns", "unshare",
    "open_by_handle_at", "name_to_handle_at", "bpf", "perf_event_open",
    "userfaultfd", "keyctl", "add_key", "request_key", "ioctl",
    "shmget", "shmat", "shmctl", "shmdt", "semget", "semop", "semtimedop", "semctl",
    "msgget", "msgsnd", "msgrcv", "msgctl", "inotify_init", "inotify_init1",
    "inotify_add_watch", "fanotify_init", "syslog", "memfd_create", "pkey_mprotect",
    NULL,
  };
  for (int index = 0; denied[index]; index++) {
    int syscall_number = resolve(denied[index]);
    if (syscall_number >= 0 &&
        rule(context, 0x50000 | EPERM, syscall_number, 0, NULL) != 0) {
      release(context);
      return fail(env);
    }
  }
  const char *memory_calls[] = {"mmap", "mmap2", "mprotect", NULL};
  for (int index = 0; memory_calls[index]; index++) {
    int syscall_number = resolve(memory_calls[index]);
    argument_comparison executable = {.arg = 2, .op = 7, .datum_a = 4, .datum_b = 4};
    if (syscall_number >= 0 &&
        rule(context, 0x50000 | EPERM, syscall_number, 1, &executable) != 0) {
      release(context);
      return fail(env);
    }
  }
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0 || load(context) != 0) {
    release(context);
    return fail(env);
  }
  release(context);
  struct rlimit cpu = {5, 5}, address_space = {2147483648ULL, 2147483648ULL};
  struct rlimit file = {0, 0}, core = {0, 0}, descriptors = {64, 64};
  if (setrlimit(RLIMIT_CPU, &cpu) || setrlimit(RLIMIT_AS, &address_space) ||
      setrlimit(RLIMIT_FSIZE, &file) || setrlimit(RLIMIT_CORE, &core) ||
      setrlimit(RLIMIT_NOFILE, &descriptors)) return fail(env);
  applied = 1;
  napi_value result;
  napi_get_boolean(env, 1, &result);
  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_value function;
  napi_create_function(env, "confine", NAPI_AUTO_LENGTH, confine, NULL, &function);
  napi_set_named_property(env, exports, "confine", function);
  napi_create_function(env, "probe", NAPI_AUTO_LENGTH, probe, NULL, &function);
  napi_set_named_property(env, exports, "probe", function);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
