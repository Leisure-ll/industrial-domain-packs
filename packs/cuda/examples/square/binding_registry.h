#pragma once
#include <vector>
#include <functional>
#include <string>
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
class BindingRegistry {
public:
    using BindingFunction = std::function<void(pybind11::module&)>;
    static BindingRegistry& getInstance() { static BindingRegistry instance; return instance; }
    void registerBinding(const std::string& name, BindingFunction function) { bindings_.push_back({name, function}); }
    void applyBindings(pybind11::module& module) { for (auto& entry : bindings_) entry.second(module); }
private:
    std::vector<std::pair<std::string, BindingFunction>> bindings_;
};
class BindingRegistrar {
public:
    BindingRegistrar(const std::string& name, BindingRegistry::BindingFunction function) {
        BindingRegistry::getInstance().registerBinding(name, function);
    }
};
#define REGISTER_BINDING(name, function) \
    static BindingRegistrar _registrar_##name(#name, [](pybind11::module& module) { function(module); })
