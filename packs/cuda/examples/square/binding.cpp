#include <pybind11/pybind11.h>
#include "binding_registry.h"
PYBIND11_MODULE(cuda_extension, m) {
    BindingRegistry::getInstance().applyBindings(m);
}
