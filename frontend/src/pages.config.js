/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import APropos from './pages/APropos';
import Account from './pages/Account';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import DevicePair from './pages/DevicePair';
import Home from './pages/Home';
import Menu from './pages/Menu';
import MesCommandes from './pages/MesCommandes';
import Order from './pages/Order';
import OrderReceiver from './pages/OrderReceiver';
import Panier from './pages/Panier';
import PolitiqueDeConfidentialite from './pages/PolitiqueDeConfidentialite';
import Reservation from './pages/Reservation';
import SuppressionCompte from './pages/SuppressionCompte';
import __Layout from './Layout.jsx';


export const PAGES = {
    "APropos": APropos,
    "Account": Account,
    "AdminDashboard": AdminDashboard,
    "AdminLogin": AdminLogin,
    "DevicePair": DevicePair,
    "Home": Home,
    "Menu": Menu,
    "MesCommandes": MesCommandes,
    "Order": Order,
    "OrderReceiver": OrderReceiver,
    "Panier": Panier,
    "politique-de-confidentialite": PolitiqueDeConfidentialite,
    "Reservation": Reservation,
    "suppression-compte": SuppressionCompte,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};
