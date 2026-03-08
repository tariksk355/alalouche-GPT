import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogOut, Trash2 } from "lucide-react";

export default function Account() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showInitialModal, setShowInitialModal] = useState(false);
  const [initialFormData, setInitialFormData] = useState({
    phone: "",
    address: "",
  });
  const [savingInitial, setSavingInitial] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    address: "",
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const currentUser = await base44.auth.me();
        if (!currentUser) {
          navigate("/");
          return;
        }
        setUser(currentUser);
        setFormData({
          full_name: currentUser.full_name || "",
          email: currentUser.email || "",
          phone: currentUser.phone || "",
          address: currentUser.address || "",
        });

        if (!currentUser.phone || !currentUser.address) {
          setShowInitialModal(true);
          setInitialFormData({
            phone: currentUser.phone || "",
            address: currentUser.address || "",
          });
        }

        const customerOrders = await base44.entities.Order.filter({
          created_by: currentUser.email,
        });
        setOrders(customerOrders.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
      } catch (err) {
        navigate("/");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [navigate]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      await base44.auth.updateMe({
        phone: formData.phone,
        address: formData.address,
      });
      
      const existingCustomer = await base44.entities.Customer.filter({
        phone: formData.phone,
      });
      
      if (existingCustomer.length > 0) {
        await base44.entities.Customer.update(existingCustomer[0].id, {
          email: user.email,
          address: formData.address,
          name: user.full_name,
        });
      } else {
        await base44.entities.Customer.create({
          name: user.full_name,
          email: user.email,
          phone: formData.phone,
          address: formData.address,
        });
      }
      
      setUser({ ...user, ...formData });
      setEditing(false);
    } catch (err) {
      setError("Erreur lors de la mise à jour du profil");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const handleSaveInitialInfo = async () => {
    if (!initialFormData.phone) {
      setError("Téléphone est requis");
      return;
    }

    setSavingInitial(true);
    setError("");
    try {
      await base44.auth.updateMe({
        phone: initialFormData.phone,
        address: initialFormData.address,
      });
      
      const existingCustomer = await base44.entities.Customer.filter({
        phone: initialFormData.phone,
      });
      
      if (existingCustomer.length > 0) {
        await base44.entities.Customer.update(existingCustomer[0].id, {
          email: user.email,
          address: initialFormData.address,
          name: user.full_name,
        });
      } else {
        await base44.entities.Customer.create({
          name: user.full_name,
          email: user.email,
          phone: initialFormData.phone,
          address: initialFormData.address,
        });
      }
      
      setUser({
        ...user,
        phone: initialFormData.phone,
        address: initialFormData.address,
      });
      setFormData({
        ...formData,
        phone: initialFormData.phone,
        address: initialFormData.address,
      });
      setShowInitialModal(false);
    } catch (err) {
      setError("Erreur lors de la sauvegarde des informations");
    } finally {
      setSavingInitial(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirm("Êtes-vous sûr de vouloir supprimer votre compte ? Cette action ne peut pas être annulée.")) {
      try {
        // Delete associated customer
        if (user?.phone) {
          const customers = await base44.entities.Customer.filter({
            phone: user.phone,
          });
          
          for (const customer of customers) {
            await base44.entities.Customer.delete(customer.id);
          }
        }

        // Note: Base44's auth.deleteAccount() is not available
        // Account deletion should be handled through Base44 dashboard admin panel
        setError("Pour supprimer votre compte, veuillez contacter l'administrateur.");
      } catch (err) {
        setError("Erreur lors de la suppression des données du compte");
      }
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Chargement...</div>;
  }

  if (!user) {
    return null;
  }

  if (showInitialModal) {
    return (
      <Dialog open={showInitialModal} onOpenChange={setShowInitialModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Complétez votre profil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone *
              </label>
              <Input
                type="tel"
                value={initialFormData.phone}
                onChange={(e) =>
                  setInitialFormData({
                    ...initialFormData,
                    phone: e.target.value,
                  })
                }
                placeholder="+41..."
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Adresse
              </label>
              <Input
                type="text"
                value={initialFormData.address}
                onChange={(e) =>
                  setInitialFormData({
                    ...initialFormData,
                    address: e.target.value,
                  })
                }
                placeholder="Votre adresse"
              />
            </div>
          </div>
          <Button
            onClick={handleSaveInitialInfo}
            disabled={savingInitial}
            className="w-full bg-[#b5122a] hover:bg-[#8f0e21] text-white"
          >
            {savingInitial ? "Enregistrement..." : "Continuer"}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  const statusLabels = {
    new: "Nouveau",
    accepted: "En préparation",
    ready: "Prête !",
    completed: "Terminée",
    cancelled: "Annulée",
  };

  const statusColors = {
    new: "bg-blue-100 text-blue-800",
    accepted: "bg-yellow-100 text-yellow-800",
    ready: "bg-green-100 text-green-800",
    completed: "bg-gray-100 text-gray-800",
    cancelled: "bg-red-100 text-red-800",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-serif font-semibold text-gray-900">Mon Compte</h1>
          <div className="flex gap-2">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </Button>
            <Button
              onClick={handleDeleteAccount}
              variant="outline"
              className="flex items-center gap-2 text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
              Supprimer le compte
            </Button>
          </div>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile">Profil</TabsTrigger>
            <TabsTrigger value="orders">Mes Commandes</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Informations Personnelles</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom Complet
                  </label>
                  <Input
                    type="text"
                    value={formData.full_name}
                    disabled
                    className="bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    disabled
                    className="bg-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone
                  </label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    disabled={!editing}
                    className={editing ? "" : "bg-gray-100"}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adresse
                  </label>
                  <Input
                    type="text"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    disabled={!editing}
                    className={editing ? "" : "bg-gray-100"}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                {!editing ? (
                  <Button
                    onClick={() => setEditing(true)}
                    className="bg-[#b5122a] hover:bg-[#8f0e21] text-white"
                  >
                    Modifier
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="bg-[#b5122a] hover:bg-[#8f0e21] text-white"
                    >
                      {saving ? "Enregistrement..." : "Enregistrer"}
                    </Button>
                    <Button
                      onClick={() => setEditing(false)}
                      variant="outline"
                    >
                      Annuler
                    </Button>
                  </>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <div className="space-y-4">
              {orders.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-gray-600">Aucune commande pour le moment</p>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={order.id} className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          Commande #{order.order_number}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {new Date(order.created_date).toLocaleDateString("fr-CH", {
                            timeZone: "Europe/Zurich",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          statusColors[order.status]
                        }`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </div>

                    <div className="border-t pt-4 mb-4">
                      <h4 className="font-semibold text-gray-900 mb-3">Articles :</h4>
                      <div className="space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            <span className="text-gray-600">
                              CHF {(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t pt-4 flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-600 mb-2">
                          <strong>Total:</strong> CHF {order.total_amount?.toFixed(2)}
                        </p>
                        {order.ready_at && (
                          <p className="text-sm text-gray-600">
                            <strong>Temps de préparation:</strong> {order.prep_time_minutes} min
                          </p>
                        )}
                      </div>
                      <span className="text-sm">
                        {order.order_type === "takeaway"
                          ? "🏪 À emporter"
                          : "🚚 Livraison"}
                      </span>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}